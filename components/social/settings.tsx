"use client";
import {useLabels} from "./labels";

import {Feature,useFeatures} from "./features";
import { useState, useEffect, type FormEvent } from "react";
import { Shield, Plus, Trash2, Mail, Lock, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Modal, Busy, request } from "./common";
import { VerificationSettings } from "./verification-settings";
import type { Person, SavedCollection } from "@/lib/types";

export function SettingsDialog({ me, onClose, onSaved, onSignOut }: {
  me: Person; onClose: () => void; onSaved: () => Promise<void> | void; onSignOut: () => void;
}) {
  const t=useLabels();
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
    void request<SavedCollection[]>("/api/social?collections=1", undefined, t).then(items => { if (active) setCollections(items); }).catch(() => { if (active) setCollections([]); });
    return () => { active = false; };
  }, [flags.saves, t]);

  const togglePrivacy = async () => {
    const next = privacy ? 0 : 1;
    setPrivacy(next);
    try {
      await request("/api/social", { action: "set_privacy", private: !!next }, t);
      await onSaved();
      toast(next ? t("settings.your_account_is_now_private") : t("settings.your_account_is_public_again"));
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
      await request("/api/social", { action: "create_collection", name: newCollection.trim() }, t);
      setNewCollection("");
      setCollections(await request<SavedCollection[]>("/api/social?collections=1", undefined, t));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(""); }
  };

  const removeCollection = async (id: string) => {
    setBusy(id);
    try {
      await request("/api/social", { action: "delete_collection", id }, t);
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
      if (result.error) throw new Error(result.error.status === 429 ? t("settings.please_wait_a_minute_before_trying_again") : result.error.message || t("settings.unable_to_start_the_email_change"));
      setNewEmail("");
      toast(t("settings.a_confirmation_link_was_sent_to_the_new_address_your_email_stays_"));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(""); }
  };

  const deleteAccount = async () => {
    setBusy("delete");
    try {
      const result = await authClient.deleteUser({ callbackURL: "/verify-email?deleted=1" });
      if (result.error) throw new Error(result.error.status === 429 ? t("settings.please_wait_a_minute_before_trying_again") : result.error.message || t("settings.unable_to_start_account_deletion"));
      toast(t("settings.a_deletion_link_is_on_its_way_to_your_email_your_account_stays_un"));
      setDeleteConfirm(false);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(""); }
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title={t("app.settings_and_privacy")} description={t("settings.privacy_collections_and_your_account")}>
      <div className="settings-sections">
        <Feature name="privateAccounts"><section className="settings-section">
          <h3><Shield size={18} />{t("settings.privacy")}</h3>
          <div className="settings-row">
            <div>
              <strong>{t("settings.private_account")}</strong>
              <p>{t("settings.only_approved_followers_can_see_your_posts_and_your_profile_conte")}</p>
            </div>
            <button role="switch" aria-checked={!!privacy} className={"switch " + (privacy ? "on" : "")} onClick={() => void togglePrivacy()} aria-label={t("settings.toggle_private_account")}>
              <span />
            </button>
          </div>
        </section></Feature>

        <Feature name="saves"><section className="settings-section">
          <h3><Bookmark size={18} />{t("settings.collections")}</h3>
          <p className="settings-hint">{t("settings.organize_saved_posts_into_groups_of_your_own")}</p>
          <form onSubmit={addCollection} className="collection-form">
            <input aria-label={t("settings.new_collection_name")} placeholder={t("settings.new_collection_name")} maxLength={40} value={newCollection} onChange={e => setNewCollection(e.target.value)} />
            <button className="primary-button" disabled={busy === "collection" || !newCollection.trim()}>{busy === "collection" ? <Busy size={15} /> : <Plus size={16} />}{t("settings.add")}</button>
          </form>
          {collections && collections.length > 0 && (
            <ul className="collection-list">
              {collections.map(item => (
                <li key={item.id}>
                  <span className="collection-name">{item.name}</span>
                  <small>{item.post_ids.length}{t("settings.saved")}</small>
                  <button aria-label={t("settings.delete_collection") + item.name} disabled={busy === item.id} onClick={() => void removeCollection(item.id)}>
                    {busy === item.id ? <Busy size={14} /> : <Trash2 size={15} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section></Feature>

        <VerificationSettings />
        <section className="settings-section">
          <h3><Mail size={18} />{t("settings.account_email")}</h3>
          <p className="settings-hint">{t("settings.currently_signed_in_as")}<strong>{me.username}</strong>{t("settings.changing_your_email_sends_a_confirmation_to_the_new_address")}</p>
          <form onSubmit={changeEmail} className="collection-form">
            <input type="email" aria-label={t("settings.new_email_address")} placeholder={t("settings.new_email_address")} autoComplete="email" maxLength={254} value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            <button className="secondary-button" disabled={busy === "email" || !newEmail.trim()}>{busy === "email" ? <Busy size={15} /> : t("settings.change_email")}</button>
          </form>
        </section>

        <section className="settings-section danger">
          <h3><Lock size={18} />{t("settings.danger_zone")}</h3>
          <div className="settings-row">
            <div>
              <strong>{t("settings.delete_your_account")}</strong>
              <p>{t("settings.permanently_removes_your_profile_posts_messages_and_saved_items_a")}</p>
            </div>
            <button className="secondary-button danger-button" disabled={busy === "delete"} onClick={() => setDeleteConfirm(true)}>
              {busy === "delete" ? <Busy size={15} /> : t("settings.delete_account")}
            </button>
          </div>
          <button className="text-action signout-link" onClick={onSignOut}>{t("settings.sign_out_of_this_device")}</button>
        </section>
      </div>

      <ConfirmDelete open={deleteConfirm} busy={busy === "delete"} onCancel={() => setDeleteConfirm(false)} onConfirm={() => void deleteAccount()} />
    </Modal>
  );
}

function ConfirmDelete({ open, busy, onCancel, onConfirm }: { open: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const t=useLabels();
  if (!open) return null;
  return (
    <div className="settings-confirm" role="alertdialog" aria-label={t("settings.confirm_account_deletion")}>
      <p>{t("settings.permanently_delete_your_account_this_cannot_be_undone")}</p>
      <div>
        <button className="secondary-button" onClick={onCancel} disabled={busy}>{t("settings.keep_my_account")}</button>
        <button className="secondary-button danger-button" onClick={onConfirm} disabled={busy}>{busy ? <Busy size={15} /> : t("settings.email_me_the_deletion_link")}</button>
      </div>
    </div>
  );
}
