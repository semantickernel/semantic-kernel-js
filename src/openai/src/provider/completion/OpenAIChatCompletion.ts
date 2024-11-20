import { OpenAIFunctionNameSeparator } from '../../OpenAIFunction';
import { OpenAIChatMessageContent } from '../../chatCompletion';
import { OpenAIStreamingChatMessageContent } from '../../chatCompletion/OpenAIStreamingChatMessageContent';
import { OpenAIPromptExecutionSettings } from '../../openAIPromptExecutionSettings';
import { createChatCompletionCreateParams } from './chatCompletionParams';
import { ChatHistory, FunctionCallContent, FunctionCallsProcessor, FunctionName, Kernel, KernelArguments } from '@semantic-kernel/abstractions';
import OpenAI from 'openai';


export type OpenAIChatCompletionParams = {
  modelId: string;
  chatHistory: ChatHistory;
  executionSettings?: OpenAIPromptExecutionSettings;
  kernel?: Kernel;
};

export class OpenAIChatCompletion {
  private readonly openAIClient: OpenAI;
  private readonly functionCallsProcessor: FunctionCallsProcessor;

  public constructor(openAIClient: OpenAI) {
    this.openAIClient = openAIClient;
    this.functionCallsProcessor = new FunctionCallsProcessor();
  }

  public getChatMessageContent = async ({
    modelId,
    chatHistory,
    executionSettings,
    kernel,
  }: OpenAIChatCompletionParams) => {
    for (let requestIndex = 1; ; requestIndex++) {
      // TODO record completion activity
      const functionCallingConfig = executionSettings?.functionChoiceBehavior?.getConfiguredOptions({
        requestSequenceIndex: requestIndex,
        chatHistory,
        kernel,
      });

      const chatCompletionCreateParams = createChatCompletionCreateParams(
        modelId,
        chatHistory,
        executionSettings,
        functionCallingConfig
      );
      const chatCompletion = await this.openAIClient.chat.completions.create(chatCompletionCreateParams);
      const chatMessageContent = this.createChatMessageContent({ chatCompletion, modelId });

      // If we don't want to attempt to invoke any functions, just return the result.
      if (!functionCallingConfig?.autoInvoke) {
        return [chatMessageContent];
      }

      // Get our single result and extract the function call information. If this isn't a function call, or if it is
      // but we're unable to find the function or extract the relevant information, just return the single result.
      // Note that we don't check the FinishReason and instead check whether there are any tool calls, as the service
      // may return a FinishReason of "stop" even if there are tool calls to be made, in particular if a required tool
      // is specified.
      if (!chatCompletion.choices[0].message.tool_calls) {
        return [chatMessageContent];
      }

      await this.functionCallsProcessor.ProcessFunctionCalls({
        chatMessageContent,
        chatHistory,
        requestIndex,
        checkIfFunctionAdvertised: (functionCallContent) =>
          OpenAIChatCompletion.checkIfFunctionAdvertised(functionCallContent, chatCompletionCreateParams.tools),
        kernel,
      });
    }
  };

  public async *getChatMessageContentStream({
    modelId,
    chatHistory,
    executionSettings,
    kernel,
  }: OpenAIChatCompletionParams) {
    const contentBuilder: string[] = [];

    for (let requestIndex = 1; ; requestIndex++) {
      // TODO record completion activity
      const functionCallingConfig = executionSettings?.functionChoiceBehavior?.getConfiguredOptions({
        requestSequenceIndex: requestIndex,
        chatHistory,
        kernel,
      });

      const chatCompletionCreateParams = createChatCompletionCreateParams(
        modelId,
        chatHistory,
        executionSettings,
        functionCallingConfig
      );

      const chatCompletionStream = await this.openAIClient.chat.completions.create({
        ...chatCompletionCreateParams,
        stream: true,
      });

      for await (const chatCompletion of chatCompletionStream) {
        contentBuilder.push(chatCompletion.choices[0].delta.content ?? '');
        yield new OpenAIStreamingChatMessageContent({ chatCompletion, modelId });
      }

      if (!functionCallingConfig?.autoInvoke) {
        return;
      }
    }
  }

  private createChatMessageContent = ({
    chatCompletion,
    modelId,
  }: {
    chatCompletion: OpenAI.ChatCompletion;
    modelId: string;
  }): OpenAIChatMessageContent => {
    const message = new OpenAIChatMessageContent({ chatCompletion, modelId });

    message.items = [...message.items, ...this.getFunctionCallContents(chatCompletion.choices[0].message.tool_calls)];

    return message;
  };

  private getFunctionCallContents(toolCalls?: Array<OpenAI.ChatCompletionMessageToolCall>) {
    const items: Array<FunctionCallContent> = [];

    if (toolCalls) {
      for (const toolCall of toolCalls) {
        // Only process function calls
        if (toolCall.type !== 'function') {
          continue;
        }

        const functionArguments = JSON.parse(toolCall.function.arguments);
        const { functionName, pluginName } = FunctionName.parse(toolCall.function.name, OpenAIFunctionNameSeparator);

        items.push(
          new FunctionCallContent({
            id: toolCall.id,
            functionName,
            pluginName,
            arguments: new KernelArguments({ arguments: functionArguments }),
          })
        );
      }
    }

    return items;
  }

  private static checkIfFunctionAdvertised(
    functionCallContent: FunctionCallContent,
    tools?: OpenAI.ChatCompletionTool[]
  ) {
    if (!tools) {
      return false;
    }

    for (const tool of tools) {
      if (tool.type !== 'function') {
        continue;
      }

      if (
        tool.function.name ===
        FunctionName.fullyQualifiedName({
          functionName: functionCallContent.functionName,
          pluginName: functionCallContent.pluginName,
          nameSeparator: OpenAIFunctionNameSeparator,
        })
      ) {
        return true;
      }
    }

    return false;
  }
}
