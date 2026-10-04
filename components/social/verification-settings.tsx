'use client';

import { useEffect, useState } from 'react';
import { useLabels } from './labels';

const QUESTIONS = [
  { id: 'name', prompt: 'What is your name?' },
  { id: 'work', prompt: 'What do you do?' },
  { id: 'why', prompt: 'Why are you applying for this verification?' },
];

export function VerificationSettings() {
  const t = useLabels();
  const [open, setOpen] = useState(false);
  const [batch, setBatch] = useState<'blue' | 'grey' | 'golden'>('blue');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState(false);
  const [info, setInfo] = useState<{ batches: { id: string; name: string; description: string }[]; batch: string | null; applications: { status: string; batch: string }[] } | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void fetch('/api/verification')
      .then(response => response.json())
      .then(data => setInfo(data as { batches: { id: string; name: string; description: string }[]; batch: string | null; applications: { status: string; batch: string }[] }))
      .catch(() => undefined);
  }, []);
  const current = QUESTIONS[step];
  const summary = step >= QUESTIONS.length;

  return <section className="settings-section">
    <h3>{t('verification.title')}</h3>
    <p className="settings-hint">{info?.batch ? t('verification.current_batch', { batch: info.batch }) : t('verification.none')}</p>
    <button className="secondary-button" type="button" onClick={() => setOpen(true)}>{t('verification.apply')}</button>
    {open && <div className="settings-confirm" role="dialog" aria-label={t('verification.dialog')} style={{ backdropFilter: 'blur(16px)' }}>
      {(info?.batches || []).map(item => <button key={item.id} className="secondary-button" type="button" onClick={() => setBatch(item.id as 'blue')}>{item.name}</button>)}
      {!summary && current && <>
        <p>{t('verification.step', { step: step + 1, total: QUESTIONS.length, batch })}</p>
        <label>{current.prompt}<input value={answers[current.id] || ''} onChange={event => setAnswers(currentAnswers => ({ ...currentAnswers, [current.id]: event.target.value }))} /></label>
        <button className="secondary-button" type="button" disabled={step === 0} onClick={() => setStep(value => value - 1)}>{t('create.back')}</button>
        <button className="primary-button" type="button" onClick={() => setStep(value => value + 1)}>{t('create.next')}</button>
      </>}
      {summary && <>
        <p>{t('verification.review', { batch })}</p>
        <label><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} /> {t('verification.terms')}</label>
        <button className="primary-button" type="button" disabled={!terms} onClick={async () => {
          const response = await fetch('/api/verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch, terms, answers: QUESTIONS.map(question => ({ id: question.id, value: answers[question.id] || '' })) }) });
          const result = await response.json() as { error?: string; batch?: string };
          setMessage(response.ok ? t('verification.submitted', { batch: result.batch || batch }) : result.error || t('verification.failed'));
        }}>{t('verification.apply')}</button>
      </>}
      {message && <p>{message}</p>}
      <button className="secondary-button" type="button" onClick={() => setOpen(false)}>{t('common.close')}</button>
    </div>}
  </section>;
}
