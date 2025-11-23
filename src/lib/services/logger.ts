import { NODE_ENV } from '$env/static/private';

export class Logger {
	private static print_to_console_enabled = NODE_ENV === 'development';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static error(...args: any[]) {
		if (this.print_to_console_enabled) {
			console.error(...args);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static warn(...args: any[]) {
		if (this.print_to_console_enabled) {
			console.warn(...args);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static info(...args: any[]) {
		if (this.print_to_console_enabled) {
			console.info(...args);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static debug(...args: any[]) {
		if (this.print_to_console_enabled) {
			console.debug(...args);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static trace(...args: any[]) {
		if (this.print_to_console_enabled) {
			console.trace(...args);
		}
	}
}
