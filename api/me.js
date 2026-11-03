import { getSession, loadUserById } from "../lib/auth.js";

export default async function handler(req, res) {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ user: null });
  const user = await loadUserById(sess.uid);
  if (!user) return res.status(401).json({ user: null });
  return res.status(200).json({ user });
}