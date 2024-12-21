import { AzureOpenAIChatCompletionService } from '@semantic-kernel/azure-openai';
import { ChatMessageContent, kernel, KernelArguments } from "semantic-kernel";

const sk = kernel().addService(
    new AzureOpenAIChatCompletionService({
        deploymentName: '<OpenAI model name>',
        endpoint: '<Azure OpenAI endpoint>',
        apiVersion: '<OpenAPI version>'
    })
);


// Example 1
sk.invokePrompt({ promptTemplate: 'Return the color of the sky' }).then((result) => {
    console.log((result?.value as ChatMessageContent).items[0].toString());
});

// Example 2
const args: KernelArguments = new KernelArguments({ 
    arguments: { topic: "school bus" }, 
    executionSettings: undefined
});

sk.invokePrompt({ promptTemplate: 'Return the color of the {{topic}}', kernelArguments: args}).then((result) => {
    console.log((result?.value as ChatMessageContent).items[0].toString());
});
