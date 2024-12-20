import { PromptTemplate } from '@semantic-kernel/abstractions/src/promptTemplate/promptTemplate';
import Handlebars from 'handlebars';
import { KernelArguments } from '../functions';

export const handlebarsPromptTemplate = (template: string): PromptTemplate => {
  return {
    render: async (_, props: KernelArguments) => {
      const compiledTemplate = Handlebars.compile(template);
      // TODO: add Kernel plugins as helpers

      return compiledTemplate(props.arguments);
    },
  };
};