/** Session handling: who is signed in, what to do when the session ends, signing out. */
import { fetchSession, logout } from '../api/client.js';
import { showUser } from '../ui/account.js';

/** Send the user to sign in, then bring them back to where they were. */
export const toLogin = () => {
  location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
};

/** Called on load and after a dropped connection: shows who is signed in, or redirects if expired. */
export async function checkSession() {
  try {
    const me = await fetchSession();
    if (me.auth && me.user) showUser(me.user);
  } catch (e) {
    if (e.status === 401) toLogin();
    // otherwise we are probably offline; the features that need the network report that themselves
  }
}

export async function signOut() {
  try {
    await logout();
  } catch {
    /* the server still expires the session; just leave */
  }
  location.href = '/login';
}
