import { Registry } from './registry.js';
import { Class } from './types.js';

export interface RegisterOptions {
  identifier?: string;
  allowProps?: string[];
}

export class ClassRegistry extends Registry<Class> {
  constructor() {
    super(c => c.name);
  }

  private classToAllowedProps = new Map<Class, string[]>();

  register(value: Class, options?: string | RegisterOptions): void {
    if (typeof options === 'object') {
      if (options.allowProps) {
        this.classToAllowedProps.set(value, options.allowProps);
      }

      super.register(value, options.identifier);
    } else {
      super.register(value, options);
    }
  }

  clear(): void {
    super.clear();
    this.classToAllowedProps.clear();
  }

  getAllowedProps(value: Class): string[] | undefined {
    return this.classToAllowedProps.get(value);
  }
}
