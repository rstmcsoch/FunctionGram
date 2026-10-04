"use client";
import {useMediaPolicy} from "./media-policy";
import {useLabels} from "./labels";

import {Feature} from "./features";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { ImagePlus, Plus, X, Film, Camera, MapPin, ChevronLeft, ChevronRight, Upload, TrendingUp } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Modal, Avatar, IconButton, Busy, upload, request } from "./common";
import type { MediaOption, Person, Post } from "@/lib/types";

type Draft = { url: string; type: string; aspect: number | null };

export const CATEGORIES = ["For you", "Travel", "Nature", "Photography", "Architecture", "Lifestyle"];

const emptyOption = (type: string): MediaOption => ({ ratio: "original", fit: type.startsWith("video/") ? "contain" : "cover", alt: "" });

export function CreateDialog({ kind: initialKind, me, people, onClose, onCreated }: {
  kind: "post" | "story" | "reel"; me: Person; people: Person[]; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const t=useLabels();
  const mediaPolicy=useMediaPolicy();
  const [kind, setKind] = useState(initialKind);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [files, setFiles] = useState<Draft[]>([]);
  const [options, setOptions] = useState<MediaOption[]>([]);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("For you");
  const [tags, setTags] = useState<Person[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const accept=mediaPolicy.allowedTypes.filter(type=>kind!=="reel"||type.startsWith("video/")).join(",");
  const isVideoDraft = (draft: Draft) => draft.type.startsWith("video/");

  const choose = async (selected: FileList | null) => {
    if (!selected?.length) return;
    setError("");
    const items = Array.from(selected);
    if (items.length + files.length > mediaPolicy.maxMedia) { setError(t("media.maxItems",{max:mediaPolicy.maxMedia})); return; }
    if ((items.some(f => f.type.startsWith("video/")) && (items.length + files.length > 1)) || files.some(isVideoDraft)) {
      setError(t("create.videos_must_be_shared_on_their_own")); return;
    }
    if (kind === "story" && items.length + files.length > 1) { setError(t("create.a_story_uses_a_single_photo_or_video")); return; }
    setBusy(t("create.uploading"));
    try {
      const added: Draft[] = [];
      for (const file of items) added.push(await upload(file, t));
      setFiles(value => [...value, ...added]);
      setOptions(value => [...value, ...added.map(d => emptyOption(d.type))]);
      setStep(2);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); if (input.current) input.current.value = ""; }
  };

  const move = (index: number, direction: -1 | 1) => {
    setFiles(value => {
      const next = [...value];
      const target = index + direction;
      if (target < 0 || target >= next.length) return value;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeFile = (index: number) => {
    setFiles(value => value.filter((_, position) => position !== index));
    setOptions(value => value.filter((_, position) => position !== index));
  };

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!files.length || busy) return;
    setBusy(t("create.sharing")); setError("");
    try {
      await request("/api/social", {
        action: "create_post", kind, media: files.map(f => f.url),
        aspects: files.every(f => f.aspect) ? files.map(f => f.aspect) : null,
        media_options: files.map((file, index) => ({
          ratio: options[index]?.ratio ?? "original",
          fit: options[index]?.fit ?? (file.type.startsWith("video/") ? "contain" : "cover"),
          alt: options[index]?.alt ?? "",
        })),
        tagged_users: tags.map(t => t.id),
        caption, location, category,
      }, t);
      await onCreated();
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const stepLabel = step === 1 ? t("create.select_media") : step === 2 ? t("create.preview") : t("create.details");

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title={t("create.create") + (kind === "reel" ? t("create.a_reel") : kind === "story" ? t("create.a_story") : t("create.a_post"))}
      description={t("create.step") + step + t("create.stepOf") + stepLabel} className="create-modal">
      <Tabs value={kind} onValueChange={value => { setKind(value as typeof kind); setFiles([]); setOptions([]); setTags([]); setTagQuery(""); setStep(1); setError(""); }}>
        <TabsList variant="line" className="product-tabs">
          <TabsTrigger value="post"><ImagePlus size={17} />{t("create.post")}</TabsTrigger>
          <Feature name="stories"><TabsTrigger value="story"><Camera size={17} />{t("create.story")}</TabsTrigger></Feature>
          <Feature name="reels"><TabsTrigger value="reel"><Film size={17} />{t("create.reel")}</TabsTrigger></Feature>
        </TabsList>
      </Tabs>

      <div className="create-steps" aria-hidden="true">
        <span className={step >= 1 ? "done" : ""} /><span className={step >= 2 ? "done" : ""} /><span className={step >= 3 ? "done" : ""} />
      </div>

      <form onSubmit={publish} className="create-form">
        <input ref={input} type="file" accept={accept} multiple={kind === "post"} onChange={e => void choose(e.target.files)} className="sr-only" aria-label={t("create.upload_photos_or_video")} />

        {step === 1 && (
          <button type="button" className="upload-drop" onClick={() => input.current?.click()} disabled={!!busy}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void choose(e.dataTransfer.files); }}>
            <span className="upload-icons"><ImagePlus /><Film /></span>
            <strong>{busy || t("create.your_next_moment_starts_here")}</strong>
            <span>{t("create.choose")}{kind === "reel" ? t("create.a_video") : t("create.photos_or_a_video")}{t("create.to_share")}</span>
            <span className="primary-button">{busy ? <Busy /> : t("create.select_from_your_device")}</span>
            <small>{t("media.hint",{max:mediaPolicy.maxFileMb,quota:mediaPolicy.dailyQuotaMb,items:mediaPolicy.maxMedia,types:accept})}</small>
          </button>
        )}

        {step === 2 && (
          <div className="create-preview">
            <div className="upload-previews">
              {files.map((file, index) => (
                <div key={file.url}>
                  {file.type.startsWith("video/")
                    ? <video src={file.url} controls playsInline />
                    : <img src={file.url} alt={t("create.upload") + (index + 1) + t("create.of") + files.length} />}
                  <IconButton label={t("create.remove_upload") + (index + 1)} onClick={() => removeFile(index)}><X size={16} /></IconButton>
                  {files.length > 1 && (
                    <span className="reorder">
                      <IconButton label={t("create.move_upload") + (index + 1) + t("create.earlier")} disabled={index === 0} onClick={() => move(index, -1)}><ChevronLeft size={15} /></IconButton>
                      <IconButton label={t("create.move_upload") + (index + 1) + t("create.later")} disabled={index === files.length - 1} onClick={() => move(index, 1)}><ChevronRight size={15} /></IconButton>
                    </span>
                  )}
                  <span className="upload-position">{index + 1}</span>
                </div>
              ))}
              {kind === "post" && files.length < mediaPolicy.maxMedia && !files.some(isVideoDraft) && (
                <button type="button" className="add-another" onClick={() => input.current?.click()} disabled={!!busy}><Plus />{t("create.add_photo")}</button>
              )}
            </div>
            {files.length > 0 && (
              <div className="media-details">
                {files.map((file, index) => (
                  <label key={file.url} className="media-detail-row">
                    <span className="media-detail-name">{t("create.photo")}{index + 1}</span>
                    <select aria-label={t("create.display_style_for_photo") + (index + 1)} value={options[index]?.fit ?? "cover"}
                      onChange={e => setOptions(current => current.map((item, position) => position === index ? { ...item, fit: e.target.value as MediaOption["fit"] } : item))}>
                      <option value="cover">{t("create.fill_frame")}</option>
                      <option value="contain">{t("create.fit_in_frame")}</option>
                    </select>
                    <input aria-label={t("create.describe_photo") + (index + 1) + t("create.for_people_using_a_screen_reader")} placeholder={t("create.alt_text_what_s_in_this_photo")} maxLength={200}
                      value={options[index]?.alt ?? ""}
                      onChange={e => setOptions(current => current.map((item, position) => position === index ? { ...(item || emptyOption(file.type)), alt: e.target.value } : item))} />
                  </label>
                ))}
              </div>
            )}
            <div className="create-preview-actions">
              <button type="button" className="secondary-button" onClick={() => setStep(1)}><Upload size={16} />{t("create.replace")}</button>
              <button type="button" className="primary-button" onClick={() => setStep(3)}>{t("create.next")}</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="create-details">
            <div className="user-line">
              <Avatar person={me} size={36} />
              <strong>{me.username}</strong>
            </div>
            <textarea aria-label={t("create.write_a_caption")} placeholder={t("create.write_a_caption_use_hashtags_to_make_it_discoverable")} maxLength={2200} rows={4} value={caption} onChange={e => setCaption(e.target.value)} />
            <span className="character-count">{caption.length}{t("create.2_200")}</span>
            <label className="location-input">
              <MapPin size={18} />
              <input placeholder={t("create.add_location")} aria-label={t("create.add_location")} maxLength={100} value={location} onChange={e => setLocation(e.target.value)} />
            </label>
            {kind !== "story" && (
              <label className="location-input category-input">
                <TrendingUp size={18} />
                <select aria-label={t("create.choose_a_category")} value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES.map(name => <option key={name} value={name}>{t.text(name)}</option>)}
                </select>
              </label>
            )}
            <Feature name="tagging"><TagPicker people={people} me={me} tags={tags} onChange={setTags} tagQuery={tagQuery} setTagQuery={setTagQuery} /></Feature>
            {kind === "story" && <p className="form-hint">{t("create.your_story_will_disappear_after_24_hours_people_can_reply_to_it_i")}</p>}
            {kind === "reel" && <p className="form-hint">{t("create.reels_appear_in_the_reels_feed_with_their_original_frame_size")}</p>}
            <div className="create-preview-actions">
              <button type="button" className="secondary-button" onClick={() => setStep(2)}><ChevronLeft size={16} />{t("create.back")}</button>
              <button className="primary-button" disabled={!!busy}>{busy ? <><Busy />{busy}{t("create.symbol")}</> : t("app.share") + t(kind==="reel"?"kind.reel":kind==="story"?"kind.story":"kind.post")}</button>
            </div>
          </div>
        )}

        {error && <p role="alert" className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

function TagPicker({ people, me, tags, onChange, tagQuery, setTagQuery }: {
  people: Person[]; me: Person; tags: Person[]; onChange: (tags: Person[]) => void; tagQuery: string; setTagQuery: (value: string) => void;
}) {
  const t=useLabels();
  const needle = tagQuery.trim().toLowerCase().replace(/^@/, "");
  // Tagging searches the server directory as the user types (the bootstrap
  // payload no longer carries hundreds of profiles), with the locally known
  // people shown immediately while that request is in flight.
  const [remote, setRemote] = useState<Person[] | null>(null);
  useEffect(() => {
    let active = true;
    // Clearing through a 0 ms timer keeps the effect body free of synchronous
    // setState (the empty query needs no request, and `candidates` is empty
    // whenever the needle is empty, so the stale list is never rendered).
    const timer = setTimeout(() => {
      if (needle.length < 1) { if (active) setRemote(null); return; }
      void request<Person[]>("/api/social?accounts=" + encodeURIComponent(needle), undefined, t)
        .then(items => { if (active) setRemote(items); })
        .catch(() => { if (active) setRemote(null); });
    }, needle.length < 1 ? 0 : 200);
    return () => { active = false; clearTimeout(timer); };
  }, [needle, t]);
  const source = remote && remote.length ? remote : people;
  const candidates = needle
    ? source.filter(p => p.id !== me.id && !tags.some(t => t.id === p.id) && (p.username + " " + p.name).toLowerCase().includes(needle)).slice(0, 6)
    : [];
  const add = (person: Person) => {
    if (tags.length >= 10) { toast.error(t("create.tag_up_to_10_people")); return; }
    onChange([...tags, person]);
    setTagQuery("");
  };
  return (
    <div className="tag-picker">
      <label className="location-input tag-input">
        <span aria-hidden="true">{t("create.symbol_2")}</span>
        <input aria-label={t("create.tag_people")} placeholder={t("create.tag_people")} autoCapitalize="none" spellCheck={false}
          value={tagQuery} onChange={e => setTagQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && candidates[0]) { e.preventDefault(); add(candidates[0]); } }} />
      </label>
      {tags.length > 0 && (
        <span className="tag-chips">
          {tags.map(person => (
            <span key={person.id} className="tag-chip">
              <Avatar person={person} size={20} />{t("create.symbol_2")}{person.username}
              <button type="button" aria-label={t("create.remove") + person.username + t("create.from_tags")} onClick={() => onChange(tags.filter(t => t.id !== person.id))}><X size={12} /></button>
            </span>
          ))}
        </span>
      )}
      {candidates.length > 0 && (
        <span className="tag-suggestions" role="listbox" aria-label={t("create.tag_suggestions")}>
          {candidates.map(person => (
            <button key={person.id} type="button" role="option" aria-selected={false} onClick={() => add(person)}>
              <Avatar person={person} size={22} /><span>{t("create.symbol_2")}{person.username}</span><small>{person.name}</small>
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

export function EditPostDialog({ post, people, onClose, onSaved }: {
  post: Post; people: Person[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const t=useLabels();
  const [caption, setCaption] = useState(post.caption);
  const [location, setLocation] = useState(post.location);
  const [category, setCategory] = useState(post.category);
  const [tags, setTags] = useState<Person[]>(() => (post.tagged_users || [])
    .map(id => people.find(p => p.id === id)).filter((p): p is Person => !!p));
  const [tagQuery, setTagQuery] = useState("");
  const [options, setOptions] = useState<MediaOption[]>(() =>
    post.media.map((url, index) => post.media_options?.[index] ?? {
      ratio: "original", fit: post.media_type === "video" ? "contain" : "cover",
      alt: post.media.some(m => m === url) && index === 0 ? "" : "",
    }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await request("/api/social", {
        action: "update_post", id: post.id, caption, location, category,
        tagged_users: tags.map(t => t.id),
        media_options: post.media.map((_, index) => ({
          ratio: options[index]?.ratio ?? "original",
          fit: options[index]?.fit ?? (post.media_type === "video" ? "contain" : "cover"),
          alt: options[index]?.alt ?? "",
        })),
      }, t);
      await onSaved();
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title={t("create.edit_post")} description={t("create.caption_location_category_tags_and_alt_text")} className="create-modal">
      <form onSubmit={save} className="create-form">
        <div className="create-details">
          <div className="user-line">
            <Avatar person={post.author} size={36} />
            <strong>{post.author.username}</strong>
          </div>
          <textarea aria-label={t("create.edit_caption")} placeholder={t("create.write_a_caption_use_hashtags_to_make_it_discoverable")} maxLength={2200} rows={4} value={caption} onChange={e => setCaption(e.target.value)} />
          <span className="character-count">{caption.length}{t("create.2_200")}</span>
          <label className="location-input">
            <MapPin size={18} />
            <input placeholder={t("create.add_location")} aria-label={t("create.edit_location")} maxLength={100} value={location} onChange={e => setLocation(e.target.value)} />
          </label>
          <label className="location-input category-input">
            <TrendingUp size={18} />
            <select aria-label={t("create.choose_a_category")} value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(name => <option key={name} value={name}>{t.text(name)}</option>)}
            </select>
          </label>
          <Feature name="tagging"><TagPicker people={people} me={post.author} tags={tags} onChange={setTags} tagQuery={tagQuery} setTagQuery={setTagQuery} /></Feature>
          {post.media.length > 0 && !post.media_type.startsWith("video/") && (
            <div className="media-details">
              {post.media.map((url, index) => (
                <label key={url} className="media-detail-row">
                  <span className="media-detail-name">{t("create.photo")}{index + 1}</span>
                  <input aria-label={t("create.describe_photo") + (index + 1) + t("create.for_people_using_a_screen_reader")} placeholder={t("create.alt_text_what_s_in_this_photo")} maxLength={200}
                    value={options[index]?.alt ?? ""}
                    onChange={e => setOptions(current => current.map((item, position) => position === index ? { ...(item || { ratio: "original", fit: "cover" as const, alt: "" }), alt: e.target.value } : item))} />
                </label>
              ))}
            </div>
          )}
          <div className="create-preview-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{t("app.cancel")}</button>
            <button className="primary-button" disabled={busy}>{busy ? <><Busy />{t("create.saving")}</> : t("create.save_changes")}</button>
          </div>
        </div>
        {error && <p role="alert" className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

export function EditProfile({ me, onClose, onSaved }: { me: Person; onClose: () => void; onSaved: () => Promise<void> }) {
  const t=useLabels();
  const [name, setName] = useState(me.name);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio);
  const [website, setWebsite] = useState(me.website ?? "");
  const [avatar, setAvatar] = useState(me.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const photo = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await upload(file, t);
      if (!result.type.startsWith("image/")) throw new Error(t("create.please_choose_a_photo"));
      setAvatar(result.url);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await request("/api/social", { action: "profile", username, name, bio, website, avatar }, t);
      await onSaved();
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title={t("create.edit_profile")}>
      <form onSubmit={submit} className="edit-form">
        <div className="edit-avatar">
          <Avatar person={{ ...me, avatar }} size={76} />
          <Feature name="uploads">          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t("create.choose_profile_photo")} onChange={e => void photo(e.target.files?.[0])} />
          <button type="button" className="text-action" onClick={() => input.current?.click()} disabled={busy}>{t("create.change_photo")}</button>
</Feature>
        </div>
        <label>{t("auth_form.name")}<input required maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>{t("create.username")}<input required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_][a-zA-Z0-9_.]{2,29}" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} /></label>
        <label>{t("create.bio")}<textarea maxLength={150} rows={3} value={bio} onChange={e => setBio(e.target.value)} /><span className="form-hint">{bio.length}{t("create.150")}</span></label>
        <label>{t("create.website")}<input type="url" maxLength={200} value={website} onChange={e => setWebsite(e.target.value)} placeholder={t("create.https")} autoCapitalize="none" spellCheck={false} /><span className="form-hint">{t("create.shown_on_your_profile")}</span></label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button disabled={busy} className="primary-button wide">{busy ? <Busy /> : t("create.save_changes")}</button>
      </form>
    </Modal>
  );
}
