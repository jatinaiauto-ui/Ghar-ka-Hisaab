const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechSupported = Boolean(Recognition);

/**
 * Wraps the browser recognizer into a single-shot session.
 * handlers: onStart(), onText(text), onFinal(text), onError(code), onEnd({ gotFinal })
 */
export function createRecognizer(lang, handlers) {
  const rec = new Recognition();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let gotFinal = false;
  rec.onstart = () => handlers.onStart();
  rec.onresult = (ev) => {
    let text = '';
    let isFinal = false;
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      text += ev.results[i][0].transcript;
      if (ev.results[i].isFinal) isFinal = true;
    }
    handlers.onText(text);
    if (isFinal && !gotFinal) { gotFinal = true; handlers.onFinal(text); }
  };
  rec.onerror = (ev) => handlers.onError(ev.error);
  rec.onend = () => handlers.onEnd({ gotFinal });

  return {
    start: () => rec.start(),
    /** Stop without firing any handler. */
    abort() {
      rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
      try { rec.abort(); } catch { /* already stopped */ }
    },
  };
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'hi-IN';
    speechSynthesis.speak(utterance);
  } catch { /* speech is a nicety, never fatal */ }
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) try { speechSynthesis.cancel(); } catch { /* ignore */ }
}
