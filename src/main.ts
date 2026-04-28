import { Plugin, Editor, MarkdownView } from 'obsidian';
import { ImproveYourSentenceSettingTab, ImproveYourSentenceSettings, DEFAULT_SETTINGS } from './settings';
import { ImproveSentenceView, IMPROVE_SENTENCE_VIEW_TYPE } from './ImproveSentenceView';

export default class ImproveYourSentencePlugin extends Plugin {
	settings: ImproveYourSentenceSettings;

	async onload() {
		console.log('loading improve your sentence plugin');
		await this.loadSettings();

		this.registerView(
			IMPROVE_SENTENCE_VIEW_TYPE,
			(leaf) => new ImproveSentenceView(leaf, this)
		);

		this.addRibbonIcon('message-square', 'Open Improve Sentence Chat', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'improve-selected-sentence',
			name: 'Improve Selected Sentence',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
				if (selection.trim() === '') {
					return;
				}
				this.activateView().then((v) => {
					if (v) {
						v.startImprovement(selection);
					}
				});
			}
		});

		this.addCommand({
			id: 'open-improve-sentence-sidebar',
			name: 'Open Sidebar Chat',
			callback: () => {
				this.activateView();
			}
		});

		this.addSettingTab(new ImproveYourSentenceSettingTab(this.app, this));
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
