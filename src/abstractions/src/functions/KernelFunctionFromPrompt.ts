import { ChatCompletionService, PromptExecutionSettings } from '../AI';
import { Kernel } from '../Kernel';
import { ChatMessageContent } from '../contents';
import { type FromSchema } from '../jsonSchema';
import { PromptTemplate, PromptTemplateConfig, PromptTemplateFormat } from '../promptTemplate';
import { KernelPromptTemplate } from '../promptTemplate/KernelPromptTemplate';
import { AIService } from '../services';
import { KernelArguments } from './KernelArguments';
import { KernelFunction } from './KernelFunction';

export type PromptRenderingResult = {
  renderedPrompt: string;
  executionSettings?: PromptExecutionSettings;
  AIService: AIService;
};

const schema = {
  type: 'object',
} as const;

export type PromptType = FromSchema<typeof schema>;

export class KernelFunctionFromPrompt extends KernelFunction<
  PromptType,
  ChatMessageContent | ChatMessageContent[] | undefined
> {
  private readonly promptTemplateConfig: PromptTemplateConfig;

  private constructor({ promptTemplateConfig }: { promptTemplateConfig: PromptTemplateConfig }) {
    super({
      metadata: {
        name: promptTemplateConfig.name ?? KernelFunctionFromPrompt.createRandomFunctionName(),
        description: promptTemplateConfig.description,
        schema: schema,
      },
    });

    this.promptTemplateConfig = promptTemplateConfig;
  }

  /**
   * Creates a new kernel function from a prompt.
   * @param params The parameters to create the kernel function from a prompt.
   * @param params.template The template for the prompt.
   * @param params.name The name of the kernel function (optional).
   * @param params.description The description of the kernel function (optional).
   * @param params.templateFormat The format of the template (optional).
   * @param params.inputVariables The input variables for the prompt (optional).
   * @param params.allowDangerouslySetContent Whether to allow dangerously set content (optional).
   * @returns A new kernel function from a prompt.
   */
  static create({
    name,
    description,
    templateFormat,
    ...props
  }: {
    promptTemplate: string;
    name?: string;
    description?: string;
    templateFormat?: PromptTemplateFormat;
    inputVariables?: string[];
    allowDangerouslySetContent?: boolean;
  }) {
    return new KernelFunctionFromPrompt({
      promptTemplateConfig: {
        name: name ?? KernelFunctionFromPrompt.createRandomFunctionName(),
        description: description ?? 'Generic function, unknown purpose',
        templateFormat: templateFormat ?? 'passthrough',
        template: props.promptTemplate,
        ...props,
      },
    });
  }

  override invokeCore = async (kernel: Kernel, args: KernelArguments<PromptType>) => {
    const { renderedPrompt, AIService, executionSettings } = await this.renderPrompt(kernel, args);

    if (AIService.serviceType === 'ChatCompletion') {
      const chatContents = await (AIService as ChatCompletionService).getChatMessageContents({
        prompt: renderedPrompt,
        executionSettings,
        kernel,
      });

      if (!chatContents || chatContents.length === 0) {
        return {
          value: undefined,
          renderedPrompt: renderedPrompt,
        };
      }

      if (chatContents.length === 1) {
        return {
          value: chatContents[0],
          renderedPrompt: renderedPrompt,
        };
      }

      return {
        value: chatContents,
        renderedPrompt: renderedPrompt,
      };
    }

    throw new Error(`Unsupported AI service type: ${AIService.serviceType}`);
  };

  override async *invokeStreamingCore<T>(kernel: Kernel, args: KernelArguments<PromptType>): AsyncGenerator<T> {
    const { renderedPrompt, AIService, executionSettings } = await this.renderPrompt(kernel, args);

    if (AIService.serviceType === 'ChatCompletion') {
      const chatContents = (AIService as ChatCompletionService).getStreamingChatMessageContents({
        prompt: renderedPrompt,
        executionSettings,
        kernel,
      });

      for await (const chatContent of chatContents) {
        yield chatContent as T;
      }

      return;
    }

    throw new Error(`Unsupported AI service type: ${AIService.serviceType}`);
  }

  private getPromptTemplate = (args: object): PromptTemplate => {
    switch (this.promptTemplateConfig.templateFormat) {
      case 'passthrough':
        // return new PassThroughPromptTemplate(this.promptTemplateConfig.template);
        return new KernelPromptTemplate(this.promptTemplateConfig.template, args);
      default:
        throw new Error(`${this.promptTemplateConfig.templateFormat} template rendering not implemented`);
    }
  };

  private async renderPrompt(kernel: Kernel, args: KernelArguments<PromptType>): Promise<PromptRenderingResult> {
    const promptTemplate = this.getPromptTemplate(args);

    const { service, executionSettings } =
      kernel.services.trySelectAIService({
        serviceType: 'ChatCompletion',
        kernelFunction: this,
        kernelArguments: args,
      }) ||
      kernel.services.trySelectAIService({
        serviceType: 'TextCompletion',
        kernelFunction: this,
        kernelArguments: args,
      }) ||
      {};

    if (!service) {
      throw new Error('AIService not found in kernel');
    }

    const renderedPrompt = await promptTemplate.render(kernel, args);

    return {
      renderedPrompt,
      executionSettings,
      AIService: service,
    };
  }

  private static createRandomFunctionName() {
    return `function_${Math.random().toString(36).substring(7)}`;
  }
}
