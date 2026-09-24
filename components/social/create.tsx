"use client";
import { useState, useRef, type FormEvent } from "react";
import { ImagePlus, Plus, X, Film, Camera, MapPin, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Modal, Avatar, IconButton, Busy, upload, request } from "./common";
import type { Person } from "@/lib/types";

type Draft = { url: string; type: string; aspect: number | null };

export function CreateDialog({ kind: initialKind, me, onClose, onCreated }: {
  kind: "post" | "story" | "reel"; me: Person; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const [kind, setKind] = useState(initialKind);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [files, setFiles] = useState<Draft[]>([]);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const accept = kind === "reel" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";
  const isVideoDraft = (draft: Draft) => draft.type.startsWith("video/");

  const choose = async (selected: FileList | null) => {
    if (!selected?.length) return;
    setError("");
    const items = Array.from(selected);
    if (items.length + files.length > 6) { setError("Choose up to 6 photos, or one video."); return; }
    if ((items.some(f => f.type.startsWith("video/")) && (items.length + files.length > 1)) || files.some(isVideoDraft)) {
      setError("Videos must be shared on their own."); return;
    }
    if (kind === "story" && items.length + files.length > 1) { setError("A story uses a single photo or video."); return; }
    setBusy("Uploading");
    try {
      const added: Draft[] = [];
      for (const file of items) added.push(await upload(file));
      setFiles(value => [...value, ...added]);
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

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!files.length || busy) return;
    setBusy("Sharing"); setError("");
    try {
      await request("/api/social", {
        action: "create_post", kind, media: files.map(f => f.url),
        aspects: files.every(f => f.aspect) ? files.map(f => f.aspect) : null,
        caption, location,
      });
      await onCreated();
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const stepLabel = step === 1 ? "Select media" : step === 2 ? "Preview" : "Details";

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title={"Create " + (kind === "reel" ? "a reel" : kind === "story" ? "a story" : "a post")}
      description={"Step " + step + " of 3 · " + stepLabel} className="create-modal">
      <Tabs value={kind} onValueChange={value => { setKind(value as typeof kind); setFiles([]); setStep(1); }}>
        <TabsList variant="line" className="product-tabs">
          <TabsTrigger value="post"><ImagePlus size={17} />Post</TabsTrigger>
          <TabsTrigger value="story"><Camera size={17} />Story</TabsTrigger>
          <TabsTrigger value="reel"><Film size={17} />Reel</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="create-steps" aria-hidden="true">
        <span className={step >= 1 ? "done" : ""} /><span className={step >= 2 ? "done" : ""} /><span className={step >= 3 ? "done" : ""} />
      </div>

      <form onSubmit={publish} className="create-form">
        <input ref={input} type="file" accept={accept} multiple={kind === "post"} onChange={e => void choose(e.target.files)} className="sr-only" aria-label="Upload photos or video" />

        {step === 1 && (
          <button type="button" className="upload-drop" onClick={() => input.current?.click()} disabled={!!busy}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void choose(e.dataTransfer.files); }}>
            <span className="upload-icons"><ImagePlus /><Film /></span>
            <strong>{busy || "Your next moment starts here"}</strong>
            <span>Choose {kind === "reel" ? "a video" : "photos or a video"} to share</span>
            <span className="primary-button">{busy ? <Busy /> : "Select from your device"}</span>
            <small>Drag &amp; drop works too · JPG, PNG, WebP, GIF, MP4 or WebM · Up to 20 MB</small>
          </button>
        )}

        {step === 2 && (
          <div className="create-preview">
            <div className="upload-previews">
              {files.map((file, index) => (
                <div key={file.url}>
                  {file.type.startsWith("video/")
                    ? <video src={file.url} controls playsInline />
                    : <img src={file.url} alt={"Upload " + (index + 1) + " of " + files.length} />}
                  <IconButton label={"Remove upload " + (index + 1)} onClick={() => setFiles(value => value.filter((_, position) => position !== index))}><X size={16} /></IconButton>
                  {files.length > 1 && (
                    <span className="reorder">
                      <IconButton label={"Move upload " + (index + 1) + " earlier"} disabled={index === 0} onClick={() => move(index, -1)}><ChevronLeft size={15} /></IconButton>
                      <IconButton label={"Move upload " + (index + 1) + " later"} disabled={index === files.length - 1} onClick={() => move(index, 1)}><ChevronRight size={15} /></IconButton>
                    </span>
                  )}
                  <span className="upload-position">{index + 1}</span>
                </div>
              ))}
              {kind === "post" && files.length < 6 && !files.some(isVideoDraft) && (
                <button type="button" className="add-another" onClick={() => input.current?.click()} disabled={!!busy}><Plus />Add photo</button>
              )}
            </div>
            <div className="create-preview-actions">
              <button type="button" className="secondary-button" onClick={() => setStep(1)}><Upload size={16} />Replace</button>
              <button type="button" className="primary-button" onClick={() => setStep(3)}>Next</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="create-details">
            <div className="user-line">
              <Avatar person={me} size={36} />
              <strong>{me.username}</strong>
            </div>
            <textarea aria-label="Write a caption" placeholder="Write a caption…" maxLength={2200} rows={4} value={caption} onChange={e => setCaption(e.target.value)} />
            <span className="character-count">{caption.length}/2,200</span>
            <label className="location-input">
              <MapPin size={18} />
              <input placeholder="Add location" aria-label="Add location" maxLength={100} value={location} onChange={e => setLocation(e.target.value)} />
            </label>
            {kind === "story" && <p className="form-hint">Your story will disappear after 24 hours.</p>}
            {kind === "reel" && <p className="form-hint">Reels appear in the Reels feed with their original frame size.</p>}
            <div className="create-preview-actions">
              <button type="button" className="secondary-button" onClick={() => setStep(2)}><ChevronLeft size={16} />Back</button>
              <button className="primary-button" disabled={!!busy}>{busy ? <><Busy />{busy}…</> : "Share " + kind}</button>
            </div>
          </div>
        )}

        {error && <p role="alert" className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

export function EditProfile({ me, onClose, onSaved }: { me: Person; onClose: () => void; onSaved: () => Promise<void> }) {
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
      const result = await upload(file);
      if (!result.type.startsWith("image/")) throw new Error("Please choose a photo.");
      setAvatar(result.url);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await request("/api/social", { action: "profile", username, name, bio, website, avatar });
      await onSaved();
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title="Edit profile">
      <form onSubmit={submit} className="edit-form">
        <div className="edit-avatar">
          <Avatar person={{ ...me, avatar }} size={76} />
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose profile photo" onChange={e => void photo(e.target.files?.[0])} />
          <button type="button" className="text-action" onClick={() => input.current?.click()} disabled={busy}>Change photo</button>
        </div>
        <label>Name<input required maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Username<input required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_][a-zA-Z0-9_.]{2,29}" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} /></label>
        <label>Bio<textarea maxLength={150} rows={3} value={bio} onChange={e => setBio(e.target.value)} /><span className="form-hint">{bio.length}/150</span></label>
        <label>Website<input type="url" maxLength={200} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" autoCapitalize="none" spellCheck={false} /><span className="form-hint">Shown on your profile</span></label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button disabled={busy} className="primary-button wide">{busy ? <Busy /> : "Save changes"}</button>
      </form>
    </Modal>
  );
}
