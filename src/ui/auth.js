import { $ } from '../lib/dom.js';
import { store } from '../store.js';
import { signIn, signUp, signOut, requestPasswordReset, setNewPassword, deleteAccount } from '../actions.js';
import { toast } from '../lib/toast.js';

/** Sign-in screen (sign in, new account, forgot password, set new password) and the account actions on Home. */

let mode = 'signin';     // signin | signup | forgot | reset

const MODES = {
  signin: { title: 'Sign in to your account.', submit: 'Sign in · अंदर आओ', email: true, password: true, autocomplete: 'current-password' },
  signup: { title: 'Create an account. Everyone’s records are kept separate.', submit: 'Create account · अकाउंट बनाओ', email: true, password: true, autocomplete: 'new-password' },
  forgot: { title: 'Enter your email and we will send you a link to set a new password.', submit: 'Send link · लिंक भेजो', email: true, password: false },
  reset: { title: 'Choose a new password.', submit: 'Change password · पासवर्ड बदलो', email: false, password: true, autocomplete: 'new-password' },
};

function showMessage(text, good = false) {
  const box = $('auth-msg');
  box.textContent = text;
  box.hidden = !text;
  box.classList.toggle('good', good);
}

function setMode(next) {
  mode = next;
  const c = MODES[mode];
  $('auth-sub').textContent = c.title;
  $('auth-submit').textContent = c.submit;
  $('auth-email-field').hidden = !c.email;
  $('auth-password-field').hidden = !c.password;
  $('auth-email').required = c.email;
  $('auth-password').required = c.password;
  if (c.autocomplete) $('auth-password').autocomplete = c.autocomplete;
  $('auth-forgot').hidden = mode !== 'signin';
  $('auth-switch-row').hidden = mode === 'reset';
  $('auth-switch-text').textContent = mode === 'signin' ? 'New here?' : 'Already have an account?';
  $('auth-switch').textContent = mode === 'signin' ? 'Create an account · नया अकाउंट' : 'Sign in · अंदर आओ';
  showMessage('');
}

function friendlyError(err) {
  if (err.name === 'AbortError' || err instanceof TypeError) return 'No internet connection. Please check it and try again.';
  switch (err.code) {
    case 'invalid_credentials': return 'The email or password is incorrect.';
    case 'user_already_exists': case 'email_exists': return 'An account with this email already exists. Please sign in.';
    case 'weak_password': return 'Your password must be at least 6 characters.';
    case 'same_password': return 'That is your current password. Please choose a new one.';
    case 'email_not_confirmed': return 'Please confirm your email using the link we sent you.';
    case 'over_request_rate_limit': case 'over_email_send_rate_limit': return 'Too many attempts. Please try again in a little while.';
    case 'validation_failed': return 'Please enter a valid email address.';
    default: return 'Something went wrong. Please try again.';
  }
}

async function submit(ev) {
  ev.preventDefault();
  const c = MODES[mode];
  const email = $('auth-email').value.trim().toLowerCase();
  const password = $('auth-password').value;
  if ((c.email && !email) || (c.password && !password)) return showMessage('Please fill in all the fields.');

  const button = $('auth-submit');
  button.disabled = true;
  showMessage('');
  try {
    if (mode === 'signin') {
      await signIn(email, password);
    } else if (mode === 'reset') {
      await setNewPassword(password);
      toast('Your password has been changed.');
    } else if (mode === 'forgot') {
      await requestPasswordReset(email);
      showMessage('If an account exists for this email, we have sent a link. Please check your inbox.', true);
    } else if ((await signUp(email, password)).needsConfirm) {
      setMode('signin');
      showMessage('We have sent a link to your email. Open it, then sign in.', true);
    }
    if (store.get().status !== 'signedout') $('auth-form').reset();
  } catch (err) {
    showMessage(friendlyError(err));
  } finally {
    button.disabled = false;
  }
}

async function confirmDelete() {
  const ok = window.confirm('Delete your account permanently? All your expenses will be erased and this cannot be undone.');
  if (!ok) return;
  try {
    await deleteAccount();
  } catch {
    toast('Could not delete the account. Please check your internet connection.');
  }
}

let wasRecovering = false;
let wasOut = false;

// After signing out from Profile, the next person should land on Home, not on Profile.
function resetTab() {
  history.replaceState(null, '', location.pathname + location.search);
  document.querySelector('[data-goto="home"]').click();
}

function render(state) {
  const out = state.status === 'signedout';
  $('auth').hidden = !out;
  $('shell').hidden = out;
  $('signed-in-as').textContent = state.user ? state.user.email : '';
  if (out && !wasOut) resetTab();
  wasOut = out;
  if (state.recovering !== wasRecovering) {
    wasRecovering = state.recovering;
    setMode(state.recovering ? 'reset' : 'signin');
  }
}

export function initAuth() {
  $('auth-form').addEventListener('submit', submit);
  $('auth-switch').addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));
  $('auth-forgot').addEventListener('click', () => setMode('forgot'));
  $('signout-btn').addEventListener('click', signOut);
  $('delete-account-btn').addEventListener('click', confirmDelete);
  store.subscribe(render);
  setMode('signin');
  render(store.get());
}
