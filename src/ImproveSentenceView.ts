import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon, Menu } from 'obsidian';
import ImproveYourSentencePlugin from './main';
import { ChatMessage, streamAIResponse } from './api';

export const IMPROVE_SENTENCE_VIEW_TYPE = "improve-sentence-view";

export class ImproveSentenceView extends ItemView {
    plugin: ImproveYourSentencePlugin;
    messages: ChatMessage[] = [];
    chatContainer: HTMLElement;
    inputEl: HTMLTextAreaElement;
    sendButton: HTMLButtonElement;
    suggestionContainer: HTMLElement;
    selectedSuggestionIndex: number = -1;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
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

        this.chatContainer.addEventListener('contextmenu', (e: MouseEvent) => {
            const selection = window.getSelection()?.toString().trim();
            if (selection) {
                const menu = new Menu();
                menu.addItem((item) => {
                    item
                        .setTitle("Save to Vocabulary")
                        .setIcon("book-marked")
                        .onClick(async () => {
                            this.plugin.saveVocabulary(selection);
                        });
                });
                menu.showAtMouseEvent(e);
            }
        });

        const inputContainer = contentEl.createDiv({ cls: 'chat-input-container sidebar' });
        
        this.suggestionContainer = inputContainer.createDiv({ cls: 'slash-suggestions', attr: { style: 'display: none;' } });

        this.inputEl = inputContainer.createEl('textarea', { cls: 'chat-input' });
        this.inputEl.placeholder = 'Type / for commands...';
        this.inputEl.rows = 2;
        
        this.sendButton = inputContainer.createEl('button', { text: 'Send', cls: 'chat-send-btn' });
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        this.inputEl.addEventListener('keydown', (e) => {
            if (this.suggestionContainer.style.display !== 'none') {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateSuggestions(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateSuggestions(-1);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.applySelectedSuggestion();
                } else if (e.key === 'Escape') {
                    this.hideSuggestions();
                }
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.inputEl.addEventListener('input', () => {
            const value = this.inputEl.value;
            if (value.startsWith('/')) {
                this.showSuggestions(value.substring(1));
            } else {
                this.hideSuggestions();
            }
        });

        // Initialize with system prompt if empty
        if (this.messages.length === 0) {
            this.messages.push({ role: 'system', content: this.plugin.settings.customPrompts[0]?.prompt || '' });
        }
    }

    showSuggestions(query: string) {
        const customPrompts = this.plugin.settings.customPrompts.filter(p => 
            p.name.toLowerCase().includes(query.toLowerCase())
        );

        const buildInSuggestions = [
            { id: 'test-vocab', name: 'Test Recent Vocabulary', prompt: 'AI helps you learn and test the 10 most recent words.' }
        ].filter(s => s.name.toLowerCase().includes(query.toLowerCase()));

        const allSuggestions = [...customPrompts, ...buildInSuggestions];

        if (allSuggestions.length === 0) {
            this.hideSuggestions();
            return;
        }

        this.suggestionContainer.empty();
        this.suggestionContainer.style.display = 'block';
        this.selectedSuggestionIndex = 0;

        allSuggestions.forEach((suggestion, index) => {
            const item = this.suggestionContainer.createDiv({ cls: 'slash-suggestion-item' });
            if (index === 0) item.addClass('selected');
            
            item.createSpan({ cls: 'slash-suggestion-name', text: suggestion.name });
            item.createSpan({ cls: 'slash-suggestion-preview', text: suggestion.prompt.substring(0, 60) + (suggestion.prompt.length > 60 ? '...' : '') });
            
            item.addEventListener('click', () => {
                this.applySuggestion(suggestion);
            });
        });
    }

    hideSuggestions() {
        this.suggestionContainer.style.display = 'none';
        this.selectedSuggestionIndex = -1;
    }

    navigateSuggestions(direction: number) {
        const items = this.suggestionContainer.querySelectorAll('.slash-suggestion-item');
        if (items.length === 0) return;

        items[this.selectedSuggestionIndex]?.removeClass('selected');
        this.selectedSuggestionIndex = (this.selectedSuggestionIndex + direction + items.length) % items.length;
        const selected = items[this.selectedSuggestionIndex];
        selected.addClass('selected');
        selected.scrollIntoView({ block: 'nearest' });
    }

    applySelectedSuggestion() {
        const items = this.suggestionContainer.querySelectorAll('.slash-suggestion-item');
        const selectedLabel = items[this.selectedSuggestionIndex]?.querySelector('.slash-suggestion-name')?.textContent;
        if (!selectedLabel) return;

        if (selectedLabel === 'Test Recent Vocabulary') {
            this.applySuggestion({ id: 'test-vocab', name: 'Test Recent Vocabulary' });
        } else {
            const prompt = this.plugin.settings.customPrompts.find(p => p.name === selectedLabel);
            if (prompt) this.applySuggestion(prompt);
        }
    }

    applySuggestion(suggestion: any) {
        if (suggestion.id === 'test-vocab') {
            this.hideSuggestions();
            this.inputEl.value = '';
            this.plugin.testRecentVocabulary();
        } else {
            this.inputEl.value = `/${suggestion.name} `;
            this.hideSuggestions();
            this.inputEl.focus();
        }
    }

    async sendMessage() {
        let text = this.inputEl.value.trim();
        if (!text) return;
        this.inputEl.value = '';

        let usedPrompt = this.plugin.settings.customPrompts[0]?.prompt || '';
        
        // Check for slash command
        for (const prompt of this.plugin.settings.customPrompts) {
            const cmd = `/${prompt.name}`;
            if (text.startsWith(cmd)) {
                usedPrompt = prompt.prompt;
                text = text.substring(cmd.length).trim();
                
                // If slash command is used, we might want to clear history or set new system prompt
                this.messages = [{ role: 'system', content: usedPrompt }];
                this.chatContainer.empty();
                break;
            }
        }

        if (!text) return;
        
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
            await this.parseAndRenderInteractiveComponents(content, bubble);
        } catch (e: any) {
            bubble.innerText += `\nError: ${e.toString()}`;
        } finally {
            this.inputEl.disabled = false;
            this.sendButton.disabled = false;
            this.inputEl.focus();
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }
    }

    async parseAndRenderInteractiveComponents(content: string, container: HTMLElement) {
        // 1. Try to find tagged JSON blocks first: ```json:type ... ```
        const taggedRegex = /```json:(flashcards|quiz|assessment)\s*([\s\S]*?)\s*```/g;
        // 2. Try to find untagged JSON blocks: ```json ... ```
        const untaggedRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
        
        let lastIndex = 0;
        let matchFound = false;

        // Try tagged blocks
        let match;
        const processedMatches: {start: number, end: number}[] = [];

        while ((match = taggedRegex.exec(content)) !== null) {
            matchFound = true;
            processedMatches.push({start: match.index, end: match.index + match[0].length});
            
            const textBefore = content.substring(lastIndex, match.index);
            if (textBefore.trim()) {
                const textDiv = container.createDiv();
                await MarkdownRenderer.renderMarkdown(textBefore, textDiv, '', this.plugin);
            }

            this.renderComponentByType(match[1], match[2], container);
            lastIndex = match.index + match[0].length;
        }

        // If no tagged blocks, try untagged ones
        if (!matchFound) {
            while ((match = untaggedRegex.exec(content)) !== null) {
                // Peek inside to see if it's our JSON
                const inner = match[1].trim();
                const type = this.autodetectJsonType(inner);
                if (type) {
                    matchFound = true;
                    processedMatches.push({start: match.index, end: match.index + match[0].length});
                    
                    const textBefore = content.substring(lastIndex, match.index);
                    if (textBefore.trim()) {
                        const textDiv = container.createDiv();
                        await MarkdownRenderer.renderMarkdown(textBefore, textDiv, '', this.plugin);
                    }
                    this.renderComponentByType(type, inner, container);
                    lastIndex = match.index + match[0].length;
                }
            }
        }

        // 3. Last resort: Try to find raw JSON objects {} in the text if nothing else matched
        if (!matchFound) {
            const rawJsonRegex = /\{(?:[^{}]|\{[^{}]*\})*\}/g; // Simple nested brace matching
            while ((match = rawJsonRegex.exec(content)) !== null) {
                const type = this.autodetectJsonType(match[0]);
                if (type) {
                    matchFound = true;
                    const textBefore = content.substring(lastIndex, match.index);
                    if (textBefore.trim()) {
                        const textDiv = container.createDiv();
                        await MarkdownRenderer.renderMarkdown(textBefore, textDiv, '', this.plugin);
                    }
                    this.renderComponentByType(type, match[0], container);
                    lastIndex = match.index + match[0].length;
                }
            }
        }

        // Render remaining text
        const remainingText = content.substring(lastIndex);
        if (remainingText.trim()) {
            const textDiv = container.createDiv();
            await MarkdownRenderer.renderMarkdown(remainingText, textDiv, '', this.plugin);
        }
    }

    autodetectJsonType(jsonStr: string): string | null {
        try {
            const data = JSON.parse(jsonStr);
            if (data.items && Array.isArray(data.items)) return 'flashcards';
            if (data.questions && Array.isArray(data.questions)) return 'quiz';
            if (data.results && Array.isArray(data.results)) return 'assessment';
        } catch (e) {
            // Might be partial JSON, try simple string check
            const lower = jsonStr.toLowerCase();
            if (lower.includes('items') && lower.includes('[')) return 'flashcards';
            if (lower.includes('questions') && lower.includes('[')) return 'quiz';
            if (lower.includes('results') && lower.includes('[')) return 'assessment';
        }
        return null;
    }

    renderComponentByType(type: string, jsonData: string, container: HTMLElement) {
        try {
            // Try standard parse first
            this.renderWithParsedData(type, JSON.parse(jsonData), container);
        } catch (e) {
            console.warn(`JSON.parse failed for ${type}, attempting regex extraction fallback...`);
            // Fallback: Regex extraction for resilience against malformed AI output
            if (type === 'flashcards') {
                const items = this.tryExtractFlashcards(jsonData);
                if (items.length > 0) this.renderFlashcards({ items }, container);
                else container.createEl('pre', { text: jsonData });
            } else if (type === 'quiz') {
                const questions = this.tryExtractQuiz(jsonData);
                if (questions.length > 0) this.renderQuiz({ questions }, container);
                else container.createEl('pre', { text: jsonData });
            } else if (type === 'assessment') {
                const results = this.tryExtractAssessment(jsonData);
                if (results.length > 0) this.renderAssessment({ results }, container);
                else container.createEl('pre', { text: jsonData });
            }
        }
    }

    renderWithParsedData(type: string, data: any, container: HTMLElement) {
        if (type === 'flashcards') this.renderFlashcards(data, container);
        else if (type === 'quiz') this.renderQuiz(data, container);
        else if (type === 'assessment') this.renderAssessment(data, container);
    }

    tryExtractFlashcards(str: string): any[] {
        const items: any[] = [];
        // Match word, definition, and optional example with very loose requirements (handles missing colons, messy quotes)
        const itemRegex = /\{[\s\S]*?word["'\s:]+([^"'\n]*)["']?[\s\S]*?definition["'\s:]+([^"'\n]*)["']?(?:[\s\S]*?example["'\s:]+([^"'\n]*)["']?)?[\s\S]*?\}/gi;
        let match;
        while ((match = itemRegex.exec(str)) !== null) {
            if (match[1].trim() || match[2].trim()) {
                items.push({
                    word: match[1].replace(/^[":\s]+/, '').trim(),
                    definition: match[2].replace(/^[":\s]+/, '').trim(),
                    example: (match[3] || "").replace(/^[":\s]+/, '').trim()
                });
            }
        }
        return items;
    }

    tryExtractQuiz(str: string): any[] {
        const questions: any[] = [];
        const questionRegex = /\{[\s\S]*?sentence["'\s:]+([^"'\n]*)["']?[\s\S]*?answer["'\s:]+([^"'\n]*)["']?[\s\S]*?word["'\s:]+([^"'\n]*)["']?[\s\S]*?\}/gi;
        let match;
        while ((match = questionRegex.exec(str)) !== null) {
            questions.push({
                sentence: match[1].replace(/^[":\s]+/, '').trim(),
                answer: match[2].replace(/^[":\s]+/, '').trim(),
                word: match[3].replace(/^[":\s]+/, '').trim()
            });
        }
        return questions;
    }

    tryExtractAssessment(str: string): any[] {
        const results: any[] = [];
        const resultRegex = /\{[\s\S]*?word["'\s:]+([^"'\n]*)["']?[\s\S]*?score["'\s:]+(\d+)[\s\S]*?\}/gi;
        let match;
        while ((match = resultRegex.exec(str)) !== null) {
            results.push({
                word: match[1].replace(/^[":\s]+/, '').trim(),
                score: parseInt(match[2])
            });
        }
        return results;
    }

    cleanJson(str: string): string {
        return str
            .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
            .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":'); // Ensure keys are quoted
    }

    renderFlashcards(data: any, container: HTMLElement) {
        const flashcardWrapper = container.createDiv({ cls: 'flashcard-container' });
        
        data.items.forEach((item: any) => {
            const card = flashcardWrapper.createDiv({ cls: 'flashcard' });
            const front = card.createDiv({ cls: 'flashcard-front', text: item.word });
            const back = card.createDiv({ cls: 'flashcard-back' });
            back.createEl('div', { cls: 'flashcard-definition', text: item.definition });
            if (item.example) {
                back.createEl('div', { cls: 'flashcard-example', text: `Ex: ${item.example}` });
            }

            card.addEventListener('click', () => {
                card.toggleClass('flipped', !card.hasClass('flipped'));
            });
        });
    }

    renderQuiz(data: any, container: HTMLElement) {
        const quizWrapper = container.createDiv({ cls: 'quiz-container' });
        const answers: Record<number, string> = {};

        data.questions.forEach((q: any, idx: number) => {
            const questionDiv = quizWrapper.createDiv({ cls: 'quiz-question' });
            
            // Handle [blank] or underscores in sentence
            const parts = q.sentence.split(/\[blank\]|_{3,}/g);
            const sentenceEl = questionDiv.createEl('div', { cls: 'quiz-sentence' });
            
            parts.forEach((part: string, pIdx: number) => {
                sentenceEl.createSpan({ text: part });
                if (pIdx < parts.length - 1) {
                    const input = sentenceEl.createEl('input', { type: 'text', cls: 'quiz-input', placeholder: '...' } as any);
                    input.addEventListener('change', () => {
                        answers[idx] = input.value.trim();
                    });
                    // Stop propagation to prevent Obsidian from intercepting keys
                    input.addEventListener('keydown', (e) => {
                        e.stopPropagation();
                    });
                    input.addEventListener('click', (e) => {
                        e.stopPropagation();
                        input.focus();
                    });
                }
            });

            // If AI provided choices
            if (q.choices && q.choices.length > 0) {
                const choiceWrapper = questionDiv.createDiv({ cls: 'quiz-choices' });
                q.choices.forEach((choice: string) => {
                    const btn = choiceWrapper.createEl('button', { text: choice, cls: 'quiz-choice-btn' });
                    btn.addEventListener('click', () => {
                        const input = questionDiv.querySelector('.quiz-input') as HTMLInputElement;
                        if (input) {
                            input.value = choice;
                            answers[idx] = choice;
                        }
                        choiceWrapper.querySelectorAll('.quiz-choice-btn').forEach(b => b.removeClass('selected'));
                        btn.addClass('selected');
                    });
                });
            }
        });

        const submitBtn = quizWrapper.createEl('button', { text: 'Check Answers', cls: 'quiz-submit-btn' });
        submitBtn.addEventListener('click', async () => {
            let userResponse = "Here are my answers for the quiz:\n";
            data.questions.forEach((q: any, idx: number) => {
                const userAnswer = (answers[idx] || "").trim();
                const isCorrect = userAnswer.toLowerCase() === q.answer.toLowerCase();
                
                // Visual feedback
                const inputs = quizWrapper.querySelectorAll(`.quiz-question`)[idx].querySelectorAll('.quiz-input');
                inputs.forEach(input => {
                    input.removeClass('correct');
                    input.removeClass('wrong');
                    input.addClass(isCorrect ? 'correct' : 'wrong');
                });

                userResponse += `- Question ${idx + 1}: Word: ${q.word}, My Answer: ${userAnswer} (${isCorrect ? 'Correct' : 'Wrong'})\n`;
            });
            
            this.inputEl.value = userResponse + "\nPlease assess my performance.";
            this.sendMessage();
        });
    }

    renderAssessment(data: any, container: HTMLElement) {
        const assessmentDiv = container.createDiv({ cls: 'assessment-result' });
        assessmentDiv.createEl('h4', { text: 'Practice Session Complete!' });
        
        data.results.forEach((res: any) => {
            const itemDiv = assessmentDiv.createDiv({ cls: 'assessment-item' });
            itemDiv.createSpan({ text: res.word, cls: 'assessment-word' });
            itemDiv.createSpan({ text: ` Score: ${res.score}/5`, cls: `assessment-score q${res.score}` });
            
            // Trigger SRS update in plugin
            this.plugin.updateSRSProgress(res.word, res.score);
        });
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
        this.messages.push({ role: 'system', content: this.plugin.settings.customPrompts[0]?.prompt || '' });
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

    async startImprovement(sentence: string, promptContent?: string) {
        this.messages = [];
        const systemPrompt = promptContent || this.plugin.settings.customPrompts[0]?.prompt || '';
        this.messages.push({ role: 'system', content: systemPrompt });
        this.messages.push({ role: 'user', content: sentence });
        
        this.chatContainer.empty();
        this.renderUserMessage(sentence);
        
        await this.generateAssistantResponse();
    }
}
