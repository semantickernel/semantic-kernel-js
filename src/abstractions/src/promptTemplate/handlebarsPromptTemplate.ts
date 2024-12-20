import { KernelArguments } from '../functions';
import { PromptTemplate } from '@semantic-kernel/abstractions/src/promptTemplate/promptTemplate';
import Handlebars from 'handlebars';

export const handlebarsPromptTemplate = (template: string): PromptTemplate => {
  return {
    render: async (_, props: KernelArguments) => {
      const compiledTemplate = Handlebars.compile(template);
      // TODO: add Kernel plugins as helpers

      return compiledTemplate(props.arguments);
    },
  };
};
