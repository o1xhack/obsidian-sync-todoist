import { App, Modal } from 'obsidian';
import { I18nKey, t } from './i18n';
import { ReleaseHighlight, ReleaseLogEntry } from './release-log';
import { UiLanguage } from './types';

export class WhatsNewModal extends Modal {
  constructor(
    app: App,
    private language: UiLanguage,
    private currentEntry: ReleaseLogEntry,
    private highlights: ReleaseHighlight[],
    private onDismiss: () => Promise<void>
  ) {
    super(app);
  }

  private tr(key: I18nKey, values?: Record<string, string | number>): string {
    return t(this.language, key, values);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.tr('whatsNew.title'));

    contentEl.createEl('h3', {
      text: this.tr('whatsNew.currentVersion', { version: this.currentEntry.version }),
    });
    contentEl.createEl('p', {
      cls: 'sync-todoist-whatsnew-current-title',
      text: this.language === 'zh-CN' ? this.currentEntry.titleZh : this.currentEntry.titleEn,
    });
    contentEl.createEl('p', {
      text: this.language === 'zh-CN' ? this.currentEntry.zh : this.currentEntry.en,
    });

    contentEl.createEl('h3', { text: this.tr('whatsNew.recent') });
    const list = contentEl.createEl('ul', { cls: 'sync-todoist-whatsnew-list' });
    for (const highlight of this.highlights) {
      list.createEl('li', {
        text: this.language === 'zh-CN' ? highlight.zh : highlight.en,
      });
    }

    contentEl.createEl('p', {
      cls: 'sync-todoist-whatsnew-footer',
      text: this.tr('whatsNew.footer'),
    });

    const buttons = contentEl.createDiv({ cls: 'sync-todoist-modal-buttons' });
    const dismissButton = buttons.createEl('button', {
      text: this.tr('whatsNew.dismiss'),
      cls: 'mod-cta',
    });
    dismissButton.onclick = async () => {
      this.close();
      await this.onDismiss();
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
