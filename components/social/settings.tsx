"use client";
import {Feature,useFeatures} from "./features";
import { useState, useEffect, type FormEvent } from "react";
import { Shield, Plus, Trash2, Mail, Lock, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Modal, Busy, request } from "./common";
import type { Person, SavedCollection } from "@/lib/types";

export function SettingsDialog({ me, onClose, onSaved, onSignOut }: {
  me: Person; onClose: () => void; onSaved: () => Promise<void> | void; onSignOut: () => void;
}) {
  const flags=useFeatures();
  const [busy, setBusy] = useState("");
  const [privacy, setPrivacy] = useState<number>(me.is_private ? 1 : 0);
  const [collections, setCollections] = useState<SavedCollection[] | null>(null);
  const [newCollection, setNewCollection] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if(!flags.saves)return;
    let active = true;
    void request<SavedCollection[]>("/api/social?collections=1").then(items => { if (active) setCollections(items); }).catch(() => { if (active) setCollections([]); });
    return () => { active = false; };
  }, [flags.saves]);

  const togglePrivacy = async () => {
    const next = privacy ? 0 : 1;
    setPrivacy(next);
    try {
      await request("/api/social", { action: "set_privacy", private: !!next });
      await onSaved();
      toast(next ? "Your account is now private." : "Your account is public again.");
    } catch (e) {
      setPrivacy(privacy);
      toast.error((e as Error).message);
    }
  };

  const addCollection = async (event: FormEvent) => {
    event.preventDefault();
    if (!newCollection.trim() || busy) return;
    setBusy("collection");
    try {
      await request("/api/social", { action: "create_collection", name: newCollection.trim() });
      setNewCollection("");
      setCollections(await request<SavedCollection[]>("/api/social?collections=1"));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(""); }
  };

  const removeCollection = async (id: string) => {
    setBusy(id);
    try {
      await request("/api/social", { action: "delete_collection", id });
      setCollections(current => (current || []).filter(item => item.id !== id));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(""); }
  };

  const changeEmail = async (event: FormEvent) => {
    event.preventDefault();
    const address = newEmail.trim();
    if (!address || busy) return;
    setBusy("email");
    try {
      const result = await authClient.changeEmail({ newEmail: address, callbackURL: "/verify-email?changed=1" });
      if (result.error) throw new Error(result.error.status === 429 ? "Please wait a minute before trying again." : result.error.message || "Unable to start the email change.");
      setNewEmail("");
      toast("A confirmation link was sent to the new address. Your email stays the same until you open it.");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(""); }
  };

  const deleteAccount = async () => {
    setBusy("delete");
    try {
      const result = await authClient.deleteUser({ callbackURL: "/verify-email?deleted=1" });
      if (result.error) throw new Error(result.error.status === 429 ? "Please wait a minute before trying again." : result.error.message || "Unable to start account deletion.");
      toast("A deletion link is on its way to your email. Your account stays until you open it.");
      setDeleteConfirm(false);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(""); }
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title="Settings and privacy" description="Privacy, collections, and your account.">
      <div className="settings-sections">
        <Feature name="privateAccounts"><section className="settings-section">
          <h3><Shield size={18} />Privacy</h3>
          <div className="settings-row">
            <div>
              <strong>Private account</strong>
              <p>Only approved followers can see your posts and your profile content.</p>
            </div>
            <button role="switch" aria-checked={!!privacy} className={"switch " + (privacy ? "on" : "")} onClick={() => void togglePrivacy()} aria-label="Toggle private account">
              <span />
            </button>
          </div>
        </section></Feature>

        <Feature name="saves"><section className="settings-section">
          <h3><Bookmark size={18} />Collections</h3>
          <p className="settings-hint">Organize saved posts into groups of your own.</p>
          <form onSubmit={addCollection} className="collection-form">
            <input aria-label="New collection name" placeholder="New collection name" maxLength={40} value={newCollection} onChange={e => setNewCollection(e.target.value)} />
            <button className="primary-button" disabled={busy === "collection" || !newCollection.trim()}>{busy === "collection" ? <Busy size={15} /> : <Plus size={16} />}Add</button>
          </form>
          {collections && collections.length > 0 && (
            <ul className="collection-list">
              {collections.map(item => (
                <li key={item.id}>
                  <span className="collection-name">{item.name}</span>
                  <small>{item.post_ids.length} saved</small>
                  <button aria-label={"Delete collection " + item.name} disabled={busy === item.id} onClick={() => void removeCollection(item.id)}>
                    {busy === item.id ? <Busy size={14} /> : <Trash2 size={15} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section></Feature>

        <section className="settings-section">
          <h3><Mail size={18} />Account email</h3>
          <p className="settings-hint">Currently signed in as <strong>{me.username}</strong>. Changing your email sends a confirmation to the new address.</p>
          <form onSubmit={changeEmail} className="collection-form">
            <input type="email" aria-label="New email address" placeholder="New email address" autoComplete="email" maxLength={254} value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            <button className="secondary-button" disabled={busy === "email" || !newEmail.trim()}>{busy === "email" ? <Busy size={15} /> : "Change email"}</button>
          </form>
        </section>

        <section className="settings-section danger">
          <h3><Lock size={18} />Danger zone</h3>
          <div className="settings-row">
            <div>
              <strong>Delete your account</strong>
              <p>Permanently removes your profile, posts, messages, and saved items. A link is sent to your email to confirm.</p>
            </div>
            <button className="secondary-button danger-button" disabled={busy === "delete"} onClick={() => setDeleteConfirm(true)}>
              {busy === "delete" ? <Busy size={15} /> : "Delete account"}
            </button>
          </div>
          <button className="text-action signout-link" onClick={onSignOut}>Sign out of this device</button>
        </section>
      </div>

      <ConfirmDelete open={deleteConfirm} busy={busy === "delete"} onCancel={() => setDeleteConfirm(false)} onConfirm={() => void deleteAccount()} />
    </Modal>
  );
}

function ConfirmDelete({ open, busy, onCancel, onConfirm }: { open: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (!open) return null;
  return (
    <div className="settings-confirm" role="alertdialog" aria-label="Confirm account deletion">
      <p>Permanently delete your account? This cannot be undone.</p>
      <div>
        <button className="secondary-button" onClick={onCancel} disabled={busy}>Keep my account</button>
        <button className="secondary-button danger-button" onClick={onConfirm} disabled={busy}>{busy ? <Busy size={15} /> : "Email me the deletion link"}</button>
      </div>
    </div>
  );
}
