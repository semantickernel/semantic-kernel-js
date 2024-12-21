import { PromptTemplate } from './PromptTemplate';
import { handlebarsPromptTemplate } from './handlebarsPromptTemplate';

export class KernelPromptTemplate implements PromptTemplate {
  constructor(
    private readonly template: string,
    private readonly args: object
  ) {}

  render() {
    return handlebarsPromptTemplate(this.template).render(undefined, this.args);
  }
}
