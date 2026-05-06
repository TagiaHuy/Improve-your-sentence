import { App, PluginSettingTab, Setting, Notice, setIcon } from 'obsidian';
import ImproveYourSentencePlugin from './main';

export interface CustomPrompt {
	id: string;
	name: string;
	prompt: string;
}

export interface VocabularyItem {
	word: string;
	context?: string;
	dateAdded: number;
	reviewCount: number;
}

export interface ImproveYourSentenceSettings {
	provider: string; // 'openai', 'gemini', 'openrouter'
	openAiApiKey: string;
	geminiApiKey: string;
	openRouterApiKey: string;
	openAiModel: string;
	geminiModel: string;
	openRouterModel: string;
	customPrompts: CustomPrompt[];
	vocabulary: VocabularyItem[];
	pendingUpdates: string[];
	vocabularyTestPrompt: string;
}

export const DEFAULT_SETTINGS: ImproveYourSentenceSettings = {
	provider: 'gemini',
	openAiApiKey: '',
	geminiApiKey: '',
	openRouterApiKey: '',
	openAiModel: 'gpt-4o',
	geminiModel: 'gemini-1.5-flash',
	openRouterModel: 'openai/gpt-4o',
	customPrompts: [
		{
			id: 'improve-sentence',
			name: 'Improve Sentence',
			prompt: `Analyze the following sentence.
Provide the syntactically correct and natural version of the sentence.
Then, provide 3 alternative versions (e.g., more professional, creative, or concise).
Format your response using Markdown, starting with "## Corrected Version:", followed by "## Alternatives:", and present the alternatives as a numbered list.
Output nothing else.`
		},
		{
			id: 'check-grammar',
			name: 'Check Grammar',
			prompt: 'Check the grammar and spelling of the following text. Provide the corrected version and a brief explanation of the changes.'
		},
		{
			id: 'translate-to-vn',
			name: 'Translate to Vietnamese',
			prompt: 'Translate the following text to Vietnamese.'
		}
	],
	vocabulary: [],
	pendingUpdates: [],
	vocabularyTestPrompt: `You are a Vocabulary Mentor helping me master these words: {{words}}.
Always guide me through these steps sequentially. Start with Step 1: Flashcards.

IMPORTANT: You MUST ONLY output the JSON data inside the specific markdown code blocks as shown below. Do not include extra text or ignore the block format.

1. **Flashcards**: Provide definitions and example sentences for each word.
   \`\`\`json:flashcards
   {
     "items": [
       { "word": "word1", "definition": "...", "example": "..." },
       ...
     ]
   }
   \`\`\`
2. **Exercise**: Create interactive exercises for each word. You can choose from:
   - **Fill in the Blank**:
     \`\`\`json:quiz
     { "questions": [{ "sentence": "He was [blank].", "answer": "happy", "word": "happy" }] }
     \`\`\`
   - **Multiple Choice**:
     \`\`\`json:choice
     { "questions": [{ "definition": "Feeling pleasure.", "answer": "happy", "word": "happy", "options": ["happy", "sad", "angry", "tired"] }] }
     \`\`\`
   - **Sentence Scramble**:
     \`\`\`json:scramble
     { "tasks": [{ "scrambled": "is He happy today", "original": "He is happy today", "word": "happy" }] }
     \`\`\`

ALWAYS include the code blocks exactly as defined above so the plugin can render the interactive UI. After providing the exercises, wait for me to check my answers. When I send you my answers, provide the correct answers and a brief explanation for each one to help me learn from my mistakes. (Note: The plugin handles the SRS progress automatically, so you don't need to provide scores).`
}

export class ImproveYourSentenceSettingTab extends PluginSettingTab {
	plugin: ImproveYourSentencePlugin;

	constructor(app: App, plugin: ImproveYourSentencePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	vocabPage = 0;
	vocabPageSize = 10;

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

		containerEl.createEl('h3', { text: 'Custom Prompts' });

		this.plugin.settings.customPrompts.forEach((prompt, index) => {
			const s = new Setting(containerEl)
				.setName(`Prompt ${index + 1}: ${prompt.name}`)
				.setDesc('Description: ' + (prompt.prompt.length > 50 ? prompt.prompt.substring(0, 50) + '...' : prompt.prompt));
			
			s.addText(text => text
				.setPlaceholder('Prompt Name')
				.setValue(prompt.name)
				.onChange(async (value) => {
					prompt.name = value;
					await this.plugin.saveSettings();
				})
			);

			s.addExtraButton(cb => {
				cb.setIcon('trash')
					.setTooltip('Delete Prompt')
					.onClick(async () => {
						this.plugin.settings.customPrompts.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					});
			});

			new Setting(containerEl)
				.setName('Prompt Content')
				.setDesc('The actual prompt sent to the AI.')
				.addTextArea(text => text
					.setPlaceholder('Enter system prompt...')
					.setValue(prompt.prompt)
					.onChange(async (value) => {
						prompt.prompt = value;
						await this.plugin.saveSettings();
					})
				);
		});

		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('Add New Prompt')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.customPrompts.push({
						id: 'custom-prompt-' + Date.now(),
						name: 'New Prompt',
						prompt: ''
					});
					await this.plugin.saveSettings();
					this.display();
				})
			);

		containerEl.createEl('h3', { text: 'Vocabulary Test Settings' });
		
		new Setting(containerEl)
			.setName('Vocabulary Test Prompt')
			.setDesc('The prompt used for testing recent vocabulary. Use {{words}} as a placeholder for the list of words.')
			.addTextArea(text => text
				.setPlaceholder('Enter vocabulary test prompt...')
				.setValue(this.plugin.settings.vocabularyTestPrompt)
				.onChange(async (value) => {
					this.plugin.settings.vocabularyTestPrompt = value;
					await this.plugin.saveSettings();
				})
			).controlEl.querySelector('textarea')?.setAttribute('rows', '10');

		containerEl.createEl('h3', { text: 'Vocabulary Management' });
		
		if (this.plugin.settings.vocabulary.length === 0) {
			containerEl.createEl('p', { text: 'No vocabulary words saved yet.', cls: 'setting-item-description' });
		} else {
			const tableWrapper = containerEl.createDiv({ cls: 'vocab-table-wrapper' });
			const table = tableWrapper.createEl('table', { cls: 'vocab-table' });
			const header = table.createEl('thead').createEl('tr');
			header.createEl('th', { text: 'Word' });
			header.createEl('th', { text: 'Added' });
			header.createEl('th', { text: 'Reviews' });
			header.createEl('th', { text: 'Actions' });

			const tbody = table.createEl('tbody');
			
			const sortedVocab = [...this.plugin.settings.vocabulary].sort((a, b) => {
				if (a.reviewCount !== b.reviewCount) return a.reviewCount - b.reviewCount;
				return b.dateAdded - a.dateAdded; // Use dateAdded search priority for same count
			});
			const start = this.vocabPage * this.vocabPageSize;
			const end = start + this.vocabPageSize;
			const pagedVocab = sortedVocab.slice(start, end);

			pagedVocab.forEach((item) => {
				const row = tbody.createEl('tr');
				row.createEl('td', { text: item.word });
				row.createEl('td', { text: new Date(item.dateAdded).toLocaleDateString() });
				row.createEl('td', { text: item.reviewCount.toString() });
				
				const actionsCell = row.createEl('td');
				const deleteBtn = actionsCell.createEl('button', { cls: 'vocab-delete-btn' });
				setIcon(deleteBtn, 'trash');
				deleteBtn.addEventListener('click', async () => {
					this.plugin.settings.vocabulary = this.plugin.settings.vocabulary.filter(v => v !== item);
					await this.plugin.saveSettings();
					this.display();
				});
			});

			const pagination = containerEl.createDiv({ cls: 'vocab-pagination' });
			const totalPages = Math.ceil(sortedVocab.length / this.vocabPageSize);
			
			const prevBtn = pagination.createEl('button', { text: 'Previous', cls: 'vocab-page-btn' });
			if (this.vocabPage === 0) prevBtn.disabled = true;
			prevBtn.addEventListener('click', () => {
				this.vocabPage--;
				this.display();
			});

			pagination.createSpan({ text: ` Page ${this.vocabPage + 1} of ${totalPages} `, cls: 'vocab-page-info' });

			const nextBtn = pagination.createEl('button', { text: 'Next', cls: 'vocab-page-btn' });
			if (this.vocabPage >= totalPages - 1) nextBtn.disabled = true;
			nextBtn.addEventListener('click', () => {
				this.vocabPage++;
				this.display();
			});
		}
	}
}
