import { Plugin, Editor, MarkdownView, Notice } from 'obsidian';
import { ImproveYourSentenceSettingTab, ImproveYourSentenceSettings, DEFAULT_SETTINGS } from './settings';
import { ImproveSentenceView, IMPROVE_SENTENCE_VIEW_TYPE } from './ImproveSentenceView';

export default class ImproveYourSentencePlugin extends Plugin {
	settings: ImproveYourSentenceSettings;

	async onload() {
		console.log('loading improve your sentence plugin');
		await this.loadSettings();

		this.registerView(
			IMPROVE_SENTENCE_VIEW_TYPE,
			(leaf) => {
				const view = new ImproveSentenceView(leaf);
				view.plugin = this;
				return view;
			}
		);

		this.addRibbonIcon('message-square', 'Open Improve Sentence Chat', () => {
			this.activateView();
		});

		this.registerCustomCommands();

		this.addCommand({
			id: 'open-improve-sentence-sidebar',
			name: 'Open Sidebar Chat',
			callback: () => {
				this.activateView();
			}
		});

		this.addCommand({
			id: 'save-selected-vocabulary',
			name: 'Save Selected to Vocabulary',
			editorCallback: (editor: Editor) => {
				const selection = editor.getSelection().trim();
				if (selection) {
					this.saveVocabulary(selection);
				}
			}
		});

		this.addCommand({
			id: 'test-recent-vocabulary',
			name: 'AI Test Recent Vocabulary',
			callback: () => {
				this.testRecentVocabulary();
			}
		});

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				const selection = editor.getSelection().trim();
				if (selection) {
					menu.addItem((item) => {
						item
							.setTitle("Save to Vocabulary")
							.setIcon("book-marked")
							.onClick(async () => {
								this.saveVocabulary(selection);
							});
					});
				}
			})
		);

		this.addSettingTab(new ImproveYourSentenceSettingTab(this.app, this));
	}

	async saveVocabulary(word: string, context?: string) {
		const existing = this.settings.vocabulary.find(v => v.word.toLowerCase() === word.toLowerCase());
		if (existing) {
			console.log("Word already in vocabulary");
			return;
		}

		const newItem: any = {
			word: word,
			context: context,
			dateAdded: Date.now(),
			nextReview: Date.now() + 24 * 60 * 60 * 1000, // Review in 1 day
			interval: 1,
			repetition: 1,
			efactor: 2.5
		};

		this.settings.vocabulary.push(newItem);
		await this.saveSettings();
		//@ts-ignore
		new Notice(`Saved "${word}" to vocabulary.`);
	}

	async testRecentVocabulary() {
		// Get 10 most recent words or words due for review
		const now = Date.now();
		const words = this.settings.vocabulary
			.sort((a, b) => a.nextReview - b.nextReview)
			.slice(0, 10);

		if (words.length === 0) {
			new Notice("No vocabulary words saved yet.");
			return;
		}

		const wordList = words.map(v => v.word).join(", ");
		const prompt = `You are a Vocabulary Mentor helping me master these 10 words: ${wordList}.
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
     { "questions": [{ "definition": "Feeling pleasure.", "answer": "happy", "options": ["happy", "sad", "angry", "tired"] }] }
     \`\`\`
   - **Sentence Scramble**:
     \`\`\`json:scramble
     { "tasks": [{ "scrambled": "is He happy today", "original": "He is happy today", "word": "happy" }] }
     \`\`\`

ALWAYS include the code blocks exactly as defined above so the plugin can render the interactive UI. After providing the exercises, wait for me to check my answers. When I send you my answers, provide the correct answers and a brief explanation for each one to help me learn from my mistakes. (Note: The plugin handles the SRS progress automatically, so you don't need to provide scores).`;

		const view = await this.activateView();
		if (view) {
			view.startImprovement("Vocabulary Practice Session", prompt);
		}
	}

	async updateSRSProgress(word: string, quality: number) {
		const item = this.settings.vocabulary.find(v => v.word.toLowerCase() === word.toLowerCase());
		if (!item) return;

		// SM-2 Algorithm
		if (quality >= 3) {
			if (item.repetition === 0) {
				item.interval = 1;
			} else if (item.repetition === 1) {
				item.interval = 6;
			} else {
				item.interval = Math.round(item.interval * item.efactor);
			}
			item.repetition++;
		} else {
			item.repetition = 0;
			item.interval = 1;
		}

		item.efactor = item.efactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
		if (item.efactor < 1.3) item.efactor = 1.3;

		item.nextReview = Date.now() + item.interval * 24 * 60 * 60 * 1000;

		await this.saveSettings();
		console.log(`Updated SRS for ${word}: Interval=${item.interval}, Repetition=${item.repetition}, E-Factor=${item.efactor.toFixed(2)}, Next Review=${new Date(item.nextReview).toLocaleDateString()}`);
	}

	registerCustomCommands() {
		this.settings.customPrompts.forEach(prompt => {
			this.addCommand({
				id: `prompt-${prompt.id}`,
				name: `Prompt: ${prompt.name}`,
				editorCallback: (editor: Editor) => {
					const selection = editor.getSelection();
					if (selection.trim() === '') {
						return;
					}
					this.activateView().then((v) => {
						if (v) {
							v.startImprovement(selection, prompt.prompt);
						}
					});
				}
			});
		});
	}

	async activateView(): Promise<ImproveSentenceView | null> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(IMPROVE_SENTENCE_VIEW_TYPE)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (!rightLeaf) return null;
			leaf = rightLeaf;
			await leaf.setViewState({
				type: IMPROVE_SENTENCE_VIEW_TYPE,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
		return leaf.view as ImproveSentenceView;
	}

	onunload() {
		console.log('unloading improve your sentence plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
