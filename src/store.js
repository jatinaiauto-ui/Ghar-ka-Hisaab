/** Tiny observable store: one immutable state object, views subscribe and re-render. */
export function createStore(initial) {
  let state = initial;
  const subscribers = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      subscribers.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

/** Everything tied to the signed-in person. Reset on sign-out so the next user never sees the last one's data. */
export const emptyData = () => ({
  currentMonth: [],                  // expenses of the real current month (drives Home)
  view: { y: new Date().getFullYear(), m: new Date().getMonth() },
  viewList: [],                      // expenses of the month shown on the Mahina tab
  viewLoading: false,
});

export const store = createStore({
  status: 'loading',                 // loading | ready | error | unconfigured | signedout
  user: null,                        // { id, email } once signed in
  profile: null,                     // optional details from the Profile screen (name, city, budget, ...)
  recovering: false,                 // arrived via a reset-password email link: ask for a new password
  categories: [],
  categoryById: {},
  otherCategory: null,
  ...emptyData(),
});

export const sumOf = (list) => list.reduce((total, e) => total + Number(e.amount), 0);

export function isCurrentMonth({ y, m }) {
  const d = new Date();
  return y === d.getFullYear() && m === d.getMonth();
}

const FALLBACK_CATEGORY = { name_en: 'Anya', name_hi: 'अन्य', icon: 'dots', color: '#EBD9C2' };

export function categoryFor(state, id) {
  return state.categoryById[id] || state.otherCategory || FALLBACK_CATEGORY;
}
