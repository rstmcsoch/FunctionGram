"use client";
import { useLabels } from "./labels";
import { ShieldCheck, UserRound } from "lucide-react";
import { Modal } from "./common";
import { ADMIN_BASE_PATH } from "@/lib/admin/config";
import { profileUrl } from "@/lib/profile-url";

/**
 * Destination chooser for accounts that hold Admin Panel authority.
 *
 * It only decides where an already-authenticated authority account wants to go;
 * it performs no authorization of its own. `adminAccess` is computed on the
 * server from the live role/permission system, and the Admin Panel link is the
 * single existing protected route (`ADMIN_BASE_PATH`), which still enforces its
 * own sign-in checks, two-factor verification, IP policy, session age and
 * role-based permissions on every request. Choosing "My Profile" uses the same
 * clean `/<username>` profile URL every other member gets.
 *
 * The option list is exported separately from the modal so it can be rendered
 * and asserted without a portal.
 */
export function AuthorityChooserOptions({ username }: { username: string }) {
  const t = useLabels();
  return (
    <div className="authority-options" role="group" aria-label={t("authority_chooser.destination_options")}>
      <a className="authority-option" href={profileUrl(username)}>
        <span className="authority-option-icon" aria-hidden="true"><UserRound /></span>
        <span className="authority-option-copy">
          <strong>{t("authority_chooser.my_profile")}</strong>
          <small>{t("authority_chooser.open_your_normal_functiongram_profile")}</small>
        </span>
      </a>
      {/* A real navigation, not client-side routing: the panel is a separate
          server-rendered, guarded route with its own authorization. */}
      <a className="authority-option" href={ADMIN_BASE_PATH} rel="nofollow">
        <span className="authority-option-icon authority-option-admin" aria-hidden="true"><ShieldCheck /></span>
        <span className="authority-option-copy">
          <strong>{t("authority_chooser.admin_panel")}</strong>
          <small>{t("authority_chooser.open_your_authorized_management_panel")}</small>
        </span>
      </a>
    </div>
  );
}

export function AuthorityChooser({ username, onClose }: { username: string; onClose: () => void }) {
  const t = useLabels();
  return (
    <Modal open onClose={onClose} className="authority-chooser"
      title={t("authority_chooser.choose_destination")}
      description={t("authority_chooser.your_account_has_administrator_access_choose_where_to_go")}>
      <AuthorityChooserOptions username={username} />
      <p className="authority-note">{t("authority_chooser.the_admin_panel_still_requires_your_existing_administrator_verifi")}</p>
      <button type="button" className="text-button wide authority-dismiss" onClick={onClose}>{t("authority_chooser.not_now")}</button>
    </Modal>
  );
}
