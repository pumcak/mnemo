import { browser } from 'wxt/browser';
import { browserStore } from '../../src/browser-store';
import type { NowPlaying } from '../../src/playback-registry';
import { formatDomains, parseDomains } from '../../src/options/domains';
import { detectPlatform, pairDevice } from '../../src/options/pairing';
import { isPaired, loadSettings, saveSettings } from '../../src/settings';

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);

  if (element === null) {
    throw new Error(`the options page is missing ${id}`);
  }

  return element as T;
};

const pairingState = byId<HTMLParagraphElement>('pairing-state');
const tokenInput = byId<HTMLInputElement>('token');
const nameInput = byId<HTMLInputElement>('name');
const serviceUrlInput = byId<HTMLInputElement>('service-url');
const pairButton = byId<HTMLButtonElement>('pair');
const pausedInput = byId<HTMLInputElement>('paused');
const blockedInput = byId<HTMLTextAreaElement>('blocked');
const blockedFeedback = byId<HTMLParagraphElement>('blocked-feedback');
const saveButton = byId<HTMLButtonElement>('save');
const nowPlayingList = byId<HTMLUListElement>('now-playing');

const say = (element: HTMLElement, message: string, problem = false): void => {
  element.textContent = message;
  element.classList.toggle('problem', problem);
};

const show = async (): Promise<void> => {
  const settings = await loadSettings(browserStore);

  serviceUrlInput.value = settings.serviceUrl;
  pausedInput.checked = settings.paused;
  blockedInput.value = formatDomains(settings.blockedDomains);

  if (isPaired(settings)) {
    say(pairingState, 'Paired. What you watch is being recorded.');
    tokenInput.value = '';
  } else {
    say(pairingState, 'Not paired yet. Nothing is being recorded.', true);
  }
};

const refreshNowPlaying = async (): Promise<void> => {
  const playing: NowPlaying[] | undefined = await browser.runtime.sendMessage({
    type: 'mnemo.nowPlaying',
  });

  nowPlayingList.replaceChildren(
    ...(playing ?? []).map((entry) => {
      const item = document.createElement('li');

      item.textContent = `${entry.rawTitle} (${entry.app})`;

      return item;
    }),
  );
};

pairButton.addEventListener('click', () => {
  void (async () => {
    say(pairingState, 'Pairing.');

    const result = await pairDevice({
      store: browserStore,
      serviceUrl: serviceUrlInput.value,
      token: tokenInput.value,
      name: nameInput.value.trim().length > 0 ? nameInput.value : 'this browser',
      platform: detectPlatform(navigator.userAgent),
    });

    const messages: Record<typeof result, string> = {
      paired: 'Paired. What you watch is being recorded.',
      unreachable: 'No answer from the service. Is it running?',
      refused: 'The service refused that token.',
      invalid: 'A token and a name are needed.',
    };

    say(pairingState, messages[result], result !== 'paired');

    if (result === 'paired') {
      await show();
    }
  })();
});

saveButton.addEventListener('click', () => {
  void (async () => {
    const parsed = parseDomains(blockedInput.value);
    const settings = await loadSettings(browserStore);

    await saveSettings(browserStore, {
      ...settings,
      paused: pausedInput.checked,
      blockedDomains: parsed.domains,
    });

    blockedInput.value = formatDomains(parsed.domains);

    say(
      blockedFeedback,
      parsed.rejected.length === 0
        ? 'Saved. One domain per line. Subdomains are covered.'
        : `Saved, without these: ${parsed.rejected.join(', ')}`,
      parsed.rejected.length > 0,
    );
  })();
});

void show();
void refreshNowPlaying();
setInterval(() => {
  void refreshNowPlaying();
}, 5_000);
