import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon } from 'obsidian';
import ImproveYourSentencePlugin from './main';
import { ChatMessage, streamAIResponse } from './api';

export const IMPROVE_SENTENCE_VIEW_TYPE = "improve-sentence-view";

export class ImproveSentenceView extends ItemView {
    plugin: ImproveYourSentencePlugin;
    messages: ChatMessage[] = [];
    chatContainer: HTMLElement;
    inputEl: HTMLTextAreaElement;
    sendButton: HTMLButtonElement;

    constructor(leaf: WorkspaceLeaf, plugin: ImproveYourSentencePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return IMPROVE_SENTENCE_VIEW_TYPE;
    }

    getDisplayText() {
        return "Improve Sentence Chat";
    }

    getIcon() {
        return "message-square";
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('improve-sentence-view-container');

        const header = contentEl.createDiv({ cls: 'sidebar-header' });
        header.createEl('h4', { text: 'AI Chat' });
        
        const refreshBtn = header.createDiv({ cls: 'refresh-icon' });
        setIcon(refreshBtn, 'rotate-ccw');
        refreshBtn.setAttribute('aria-label', 'Clear history');
        refreshBtn.addEventListener('click', () => this.clearHistory());
        
        this.chatContainer = contentEl.createDiv({ cls: 'chat-container sidebar' });

        const inputContainer = contentEl.createDiv({ cls: 'chat-input-container sidebar' });
        this.inputEl = inputContainer.createEl('textarea', { cls: 'chat-input' });
        this.inputEl.placeholder = 'Type to chat...';
        this.inputEl.rows = 2;
        
        this.sendButton = inputContainer.createEl('button', { text: 'Send', cls: 'chat-send-btn' });
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Initialize with system prompt if empty
        if (this.messages.length === 0) {
            this.messages.push({ role: 'system', content: this.plugin.settings.systemPrompt });
        }
    }

    async sendMessage() {
        const text = this.inputEl.value.trim();
        if (!text) return;
        this.inputEl.value = '';
        
        this.messages.push({ role: 'user', content: text });
        this.renderUserMessage(text);
        
        await this.generateAssistantResponse();
    }

    async generateAssistantResponse() {
        const assistantMessageIdx = this.messages.length;
        this.messages.push({ role: 'assistant', content: '' });
        const bubble = this.createMessageBubble('assistant');
        
        this.inputEl.disabled = true;
        this.sendButton.disabled = true;

        try {
            const stream = streamAIResponse(this.messages.slice(0,-1), this.plugin.settings);
            let content = '';
            for await (const chunk of stream) {
                content += chunk;
                bubble.innerText = content;
                this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
            }
            this.messages[assistantMessageIdx].content = content;
            
            bubble.empty();
            await MarkdownRenderer.renderMarkdown(content, bubble, '', this.plugin);
        } catch (e: any) {
            bubble.innerText += `\nError: ${e.toString()}`;
        } finally {
            this.inputEl.disabled = false;
            this.sendButton.disabled = false;
            this.inputEl.focus();
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }
    }

    renderUserMessage(content: string) {
        const bubble = this.createMessageBubble('user');
        bubble.innerText = content;
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    createMessageBubble(role: 'user'|'assistant') {
        const wrapper = this.chatContainer.createDiv({ cls: `chat-message ${role}` });
        const bubble = wrapper.createDiv({ cls: 'bubble' });
        return bubble;
    }

    async clearHistory() {
        this.messages = [];
        this.messages.push({ role: 'system', content: this.plugin.settings.systemPrompt });
        this.chatContainer.empty();
    }

    async setMessages(messages: ChatMessage[]) {
        this.messages = [...messages];
        this.chatContainer.empty();
        for (const msg of this.messages) {
            if (msg.role === 'system') continue;
            const bubble = this.createMessageBubble(msg.role as any);
            await MarkdownRenderer.renderMarkdown(msg.content, bubble, '', this.plugin);
        }
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    async startImprovement(sentence: string) {
        this.messages = [];
        this.messages.push({ role: 'system', content: this.plugin.settings.systemPrompt });
        this.messages.push({ role: 'user', content: `Please improve this sentence:\n\n"${sentence}"` });
        
        this.chatContainer.empty();
        this.renderUserMessage(`Improve this: "${sentence}"`);
        
        await this.generateAssistantResponse();
    }
}
