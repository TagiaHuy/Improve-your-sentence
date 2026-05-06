import { Plugin, Editor, MarkdownView, Notice, View } from 'obsidian';
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
			callback: () => {
				const selection = this.getSelectionText();

				if (selection) {
					this.saveVocabulary(selection);
				} else {
					//@ts-ignore
					new Notice("Please select some text first.");
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
			//@ts-ignore
			new Notice(`"${word}" is already in your vocabulary.`);
			return;
		}

		const newItem: any = {
			word: word,
			context: context,
			dateAdded: Date.now(),
			reviewCount: 0 // New words start with 0 reviews (or 1 if you count saving as a review, but user usually means practice)
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
			.sort((a, b) => {
				if (a.reviewCount !== b.reviewCount) return a.reviewCount - b.reviewCount;
				return b.dateAdded - a.dateAdded;
			})
			.slice(0, 10);

		if (words.length === 0) {
			new Notice("No vocabulary words saved yet.");
			return;
		}

		const wordList = words.map(v => v.word).join(", ");
		let prompt = this.settings.vocabularyTestPrompt || DEFAULT_SETTINGS.vocabularyTestPrompt;
		prompt = prompt.replace("{{words}}", wordList);

		// Store the session words for /done to reference
		this.settings.pendingUpdates = words.map(v => v.word);
		await this.saveSettings();

		const view = await this.activateView();
		if (view) {
			view.startImprovement("Vocabulary Practice Session", prompt);
		}
	}

	async updateMultipleProgress(updates: string[]) {
		let updatedCount = 0;
		updates.forEach((word) => {
			const item = this.settings.vocabulary.find(v => 
				v.word.toLowerCase().trim().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "") === 
				word.toLowerCase().trim().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
			);
			if (item) {
				item.reviewCount = (item.reviewCount || 0) + 1;
				updatedCount++;
			}
		});

		if (updatedCount > 0) {
			await this.saveSettings();
			new Notice(`Saved progress for ${updatedCount} words!`);
		}
	}

	async updateSRSProgress(word: string, quality: number) {
		await this.updateMultipleProgress([word]);
	}

	private getSelectionText(): string {
		// 1. Try Markdown Editor
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			const selection = activeView.editor.getSelection().trim();
			if (selection) return selection;
		}

		// 2. Try window selection
		const windowSelection = window.getSelection()?.toString().trim();
		if (windowSelection) return windowSelection;

		// 3. Try PDF View specifically
		const genericView = this.app.workspace.activeLeaf?.view;
		if (genericView && genericView.getViewType() === 'pdf') {
			// @ts-ignore
			const pdfSelection = genericView.viewer?.child?.getTextSelection?.();
			if (pdfSelection) return pdfSelection.trim();
		}

		return "";
	}

	registerCustomCommands() {
		this.settings.customPrompts.forEach(prompt => {
			this.addCommand({
				id: `prompt-${prompt.id}`,
				name: `Prompt: ${prompt.name}`,
				callback: () => {
					const selection = this.getSelectionText();
					if (!selection) {
						new Notice("Please select some text first.");
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
		// Migration: Convert pendingUpdates from object {} to array []
		if (this.settings.pendingUpdates && !Array.isArray(this.settings.pendingUpdates)) {
			this.settings.pendingUpdates = [];
			await this.saveSettings();
		}
		
		// Migration: Convert repetition to reviewCount and clean up old keys
		if (this.settings.vocabulary) {
			this.settings.vocabulary.forEach((item: any) => {
				if (item.repetition !== undefined && item.reviewCount === undefined) {
					item.reviewCount = item.repetition;
				}
				// Clean up old fields
				delete item.repetition;
				delete item.nextReview;
				delete item.interval;
				delete item.efactor;
			});
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
