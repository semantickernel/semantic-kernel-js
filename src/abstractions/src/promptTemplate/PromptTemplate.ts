import { Kernel } from '../Kernel';

export interface PromptTemplate {
  render<Props>(kernel: Kernel | undefined, Props: Props): string | Promise<string>;
}
