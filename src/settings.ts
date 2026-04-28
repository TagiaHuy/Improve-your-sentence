import { App, PluginSettingTab, Setting } from 'obsidian';
import ImproveYourSentencePlugin from './main';

export interface ImproveYourSentenceSettings {
	provider: string; // 'openai', 'gemini', 'openrouter'
	openAiApiKey: string;
	geminiApiKey: string;
	openRouterApiKey: string;
	openAiModel: string;
	geminiModel: string;
	openRouterModel: string;
	systemPrompt: string;
}

export const DEFAULT_SETTINGS: ImproveYourSentenceSettings = {
	provider: 'gemini',
	openAiApiKey: '',
	geminiApiKey: '',
	openRouterApiKey: '',
	openAiModel: 'gpt-4o',
	geminiModel: 'gemini-1.5-flash',
	openRouterModel: 'openai/gpt-4o',
	systemPrompt: `Analyze the following sentence.
Provide the syntactically correct and natural version of the sentence.
Then, provide 3 alternative versions (e.g., more professional, creative, or concise).
Format your response using Markdown, starting with "## Corrected Version:", followed by "## Alternatives:", and present the alternatives as a numbered list.
Output nothing else.`
}

export class ImproveYourSentenceSettingTab extends PluginSettingTab {
	plugin: ImproveYourSentencePlugin;

	constructor(app: App, plugin: ImproveYourSentencePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Improve Your Sentence Settings' });

		new Setting(containerEl)
			.setName('AI Provider')
			.setDesc('Select the AI provider to use for generating sentence improvements.')
			.addDropdown(dropdown => dropdown
				.addOption('openai', 'OpenAI (ChatGPT)')
				.addOption('gemini', 'Google Gemini')
				.addOption('openrouter', 'OpenRouter')
				.setValue(this.plugin.settings.provider)
				.onChange(async (value) => {
					this.plugin.settings.provider = value;
					await this.plugin.saveSettings();
					this.display(); // re-render to show appropriate API key input
				})
			);

		if (this.plugin.settings.provider === 'openai') {
			new Setting(containerEl)
				.setName('OpenAI API Key')
				.setDesc('Enter your OpenAI API secret key.')
				.addText(text => text
					.setPlaceholder('sk-...')
					.setValue(this.plugin.settings.openAiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openAiApiKey = value;
						await this.plugin.saveSettings();
					})
				);
			new Setting(containerEl)
				.setName('OpenAI Model')
				.setDesc('Enter the OpenAI model ID (e.g., gpt-4o, gpt-3.5-turbo).')
				.addText(text => text
					.setPlaceholder('gpt-4o')
					.setValue(this.plugin.settings.openAiModel)
					.onChange(async (value) => {
						this.plugin.settings.openAiModel = value;
						await this.plugin.saveSettings();
					})
				);
		} else if (this.plugin.settings.provider === 'gemini') {
			new Setting(containerEl)
				.setName('Gemini API Key')
				.setDesc('Enter your Google Gemini API key.')
				.addText(text => text
					.setPlaceholder('AIzaSy...')
					.setValue(this.plugin.settings.geminiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.geminiApiKey = value;
						await this.plugin.saveSettings();
					})
				);
			new Setting(containerEl)
				.setName('Gemini Model')
				.setDesc('Enter the Gemini model ID (e.g., gemini-1.5-flash, gemini-1.5-pro).')
				.addText(text => text
					.setPlaceholder('gemini-1.5-flash')
					.setValue(this.plugin.settings.geminiModel)
					.onChange(async (value) => {
						this.plugin.settings.geminiModel = value;
						await this.plugin.saveSettings();
					})
				);
		} else if (this.plugin.settings.provider === 'openrouter') {
			new Setting(containerEl)
				.setName('OpenRouter API Key')
				.setDesc('Enter your OpenRouter API key.')
				.addText(text => text
					.setPlaceholder('sk-or-...')
					.setValue(this.plugin.settings.openRouterApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openRouterApiKey = value;
						await this.plugin.saveSettings();
					})
				);
			new Setting(containerEl)
				.setName('OpenRouter Model')
				.setDesc('Enter the OpenRouter model ID (e.g., openai/gpt-4o, anthropic/claude-3-sonnet).')
				.addText(text => text
					.setPlaceholder('openai/gpt-4o')
					.setValue(this.plugin.settings.openRouterModel)
					.onChange(async (value) => {
						this.plugin.settings.openRouterModel = value;
						await this.plugin.saveSettings();
					})
				);
		}

		new Setting(containerEl)
			.setName('System Prompt')
			.setDesc('Customize how the AI should respond to the sentence selection.')
			.addTextArea(text => text
				.setPlaceholder('Enter system prompt...')
				.setValue(this.plugin.settings.systemPrompt)
				.onChange(async (value) => {
					this.plugin.settings.systemPrompt = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
