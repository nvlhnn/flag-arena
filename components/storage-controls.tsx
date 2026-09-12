import { useEffect, useState } from 'react';

type Session = { id: string; title: string; protected: boolean; broadcasts: { id: string; title: string; startedAt: number }[]; votes: number; donations: number; viewers: number; points: number };
type Storage = { sessions: Session[]; databaseBytes: number; reusableBytes: number };
type Preview = { sessions: Session[]; token: string };
const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
async function request(path: string, body?: unknown) {
  const response = await fetch('/api/' + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (response.status === 404)
    throw new Error('The running Flag Arena server needs an update. Close its server window, reopen Start Flag Arena.cmd, then refresh this page. Your saved sessions will be kept.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Storage request failed.');
  return data;
}
export function StorageControls({ local }: { local: boolean }) {
  const [data, setData] = useState<Storage>();
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    if (!local) return;
    let stopped = false;
    void request('storage').then(result => { if (!stopped) setData(result); }).catch(error => { if (!stopped) setMessage(error.message); });
    return () => { stopped = true; };
  }, [local]);
  async function refresh() {
    setBusy(true); setPreview(undefined); setConfirmed(false); setSelected([]);
    try { setData(await request('storage')); setMessage(''); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function review() {
    setBusy(true); setMessage(''); setConfirmed(false);
    try { setPreview(await request('cleanup/preview', { sessions: selected })); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!preview || !confirmed) return;
    setBusy(true);
    try {
      const result = await request('cleanup', { sessions: preview.sessions.map(s => s.id), token: preview.token, confirmed });
      setPreview(undefined); setSelected([]); setConfirmed(false);
      setMessage(`Deleted ${result.deleted} session${result.deleted === 1 ? '' : 's'}.`);
      setData(await request('storage'));
    } catch (error) { setMessage((error as Error).message); setPreview(undefined); setConfirmed(false); }
    finally { setBusy(false); }
  }
  return <section className="analytics-main storage-controls" aria-label="Storage cleanup">
    <h2>Storage & cleanup</h2>
    {!local ? <p>Open the local Flag Arena app to manage saved sessions.</p> : <>
      <p>Choose old sessions to delete. The current or last connected session is protected, including its linked broadcasts.</p>
      {data && <p>Database: <b>{size(data.databaseBytes)}</b> · Available for reuse: <b>{size(data.reusableBytes)}</b><br/><small>Deleted space is reused by future data; the database file may not shrink immediately.</small></p>}
      <button className="secondary" disabled={busy} onClick={() => void refresh()}>Refresh sessions</button>
      {message && <output className="storage-message">{message}</output>}
      {data?.sessions.length === 0 && <p>No saved livestream sessions yet.</p>}
      {data?.sessions.map(session => <article className="control-card" key={session.id}>
        <label className="storage-select"><input type="checkbox" disabled={busy || session.protected || !!preview} checked={selected.includes(session.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, session.id] : previous.filter(id => id !== session.id))}/><b>{session.title}</b></label>
        {session.protected && <small>Protected · current / last connected session</small>}
        <p>{session.points.toLocaleString()} saved points · {session.viewers.toLocaleString()} viewer profiles<br/>{session.votes.toLocaleString()} votes · {session.donations.toLocaleString()} donations · {session.broadcasts.length} broadcasts</p>
        <details><summary>Included broadcasts</summary><ul>{session.broadcasts.map(broadcast => <li key={broadcast.id}><a href={`https://youtube.com/watch?v=${broadcast.id}`} target="_blank" rel="noreferrer">{broadcast.title}</a> · {new Date(broadcast.startedAt).toLocaleDateString()} <small>{broadcast.id}</small></li>)}</ul></details>
      </article>)}
      {!preview ? <button className="secondary" disabled={busy || !selected.length} onClick={() => void review()}>Review cleanup ({selected.length})</button> : <div className="control-card">
        <h3>Delete {preview.sessions.length} selected sessions?</h3>
        <ul>{preview.sessions.map(session => <li key={session.id}>{session.title} · {session.broadcasts.length} broadcasts · {session.votes.toLocaleString()} votes · {session.donations.toLocaleString()} donations</li>)}</ul>
        <p>This permanently removes their scores, viewer progress, subscriber bonus history, votes, donations, rankings, and chat checkpoints. Deleted sessions cannot be continued. No backup is created by cleanup.</p>
        <label className="storage-select"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/> I understand this cannot be undone.</label>
        <button className="secondary" disabled={busy || !confirmed} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Permanently delete selected sessions'}</button>
        <button className="text-button" disabled={busy} onClick={() => { setPreview(undefined); setConfirmed(false); }}>Cancel</button>
      </div>}
    </>}
  </section>;
}
