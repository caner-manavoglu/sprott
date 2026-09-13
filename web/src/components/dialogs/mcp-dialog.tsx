import { useEffect, useState } from 'react';
import { api } from '../../api';
import { toast } from '../../lib/toast';
import { Button, Input } from '../ui';
import { DialogShell } from './shell';

type Connection = {id: number; name: string; createdAt: string; lastUsedAt: string | null; expires: number};
export function McpDialog({onClose}: {onClose: () => void}) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [key, setKey] = useState<{id: number; token: string} | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revoke, setRevoke] = useState<Connection | null>(null);
  const url = `${window.location.origin}/api/mcp/http`;
  const local = ['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
  const config = JSON.stringify({mcpServers: {sprott: {url, headers: {Authorization: `Bearer ${key?.token ?? ''}`}}}}, null, 2);
  const refresh = async () => setConnections(await api<Connection[]>('mcp/connections'));
  useEffect(() => {void refresh().catch(err => setError(err.message));}, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try {await action();} catch (err) {setError((err as Error).message); toast((err as Error).message, 'error');} finally {setBusy(false);}
  }
  const copy = (value: string) => void run(async () => {
    try {await navigator.clipboard.writeText(value);} catch {throw new Error('Kopyalanamadı. Tarayıcınızın pano iznini kontrol edin.');}
    toast('Panoya kopyalandı.');
  });
  return <DialogShell open title="MCP bağlantısı" description="AI aracınızı HTTP üzerinden hesabınıza bağlayın." error={error} busy={busy} onClose={onClose} wide>
    <div className="mcp-setup">
      <p>Yalnızca size atanmış task’ları okur ve izin verilen statü geçişlerini yapar. Yorum veya diğer alanları değiştiremez.</p>
      <label>MCP sunucu URL’si<Input readOnly value={url}/></label>
      <Button variant="outline" disabled={busy} onClick={() => copy(url)}>URL’yi kopyala</Button>
      {local && <p role="note">Bu yerel adres yalnızca sunucunun çalıştığı bilgisayarda kullanılabilir. İki bilgisayardan bağlanmak için Sprott’u ortak HTTPS adresinden açın.</p>}
      <p>İki bilgisayar aynı sunucu URL’sini kullanır. Her biri için ayrı isimli anahtar oluşturun; böylece birini iptal etmek diğerini etkilemez. Node.js veya klasör yolu gerekmez.</p>
      <label>Bağlantı adı<Input maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Örnek: İş bilgisayarım"/></label>
      <Button disabled={busy || !connections || !name.trim()} onClick={() => void run(async () => {
        setKey(await api('mcp/token', 'POST', {name: name.trim()})); setName(''); await refresh();
      })}>Anahtar oluştur</Button>
      {key && <>
        <p>Anahtar yalnızca bu ekranda gösterilir ve 30 gün geçerlidir. Kapatmadan kopyalayın. Yapılandırmayı paylaşmayın.</p>
        <label>Kişisel anahtar<Input readOnly type="password" value={key.token}/></label>
        <Button variant="outline" disabled={busy} onClick={() => copy(key.token)}>Anahtarı kopyala</Button>
        <label>HTTP MCP yapılandırması<textarea readOnly rows={7} value={config} spellCheck={false}/></label>
        <Button disabled={busy} onClick={() => copy(config)}>Yapılandırmayı kopyala</Button>
        <p>AI aracınızda Streamable HTTP seçin. URL ve Authorization: Bearer anahtarını tanımlayın. JSON ayar formatı istemciye göre değişebilir; yalnızca OAuth kabul eden istemciler henüz desteklenmez.</p>
      </>}
      <div className="row-actions"><strong>Bağlantılarım</strong><Button variant="ghost" disabled={busy} onClick={() => void run(refresh)}>Yenile</Button></div>
      {connections === null ? <p>Yükleniyor…</p> : !connections.length ? <p>Henüz bağlantınız yok.</p> : <ul className="mcp-connections">{connections.map(connection => <li key={connection.id}>
        <div><strong>{connection.name}</strong><small>{connection.expires > Date.now() ? 'Aktif' : 'Süresi dolmuş'} · Bitiş: {new Date(connection.expires).toLocaleDateString('tr-TR')}</small>
          <small>Oluşturulma: {new Date(connection.createdAt).toLocaleString('tr-TR')}</small>
          <small>Son kullanım: {connection.lastUsedAt ? new Date(connection.lastUsedAt).toLocaleString('tr-TR') : 'Henüz kullanılmadı'}</small></div>
        <Button variant="outline" disabled={busy} aria-label={`${connection.name} bağlantısını iptal et`} onClick={() => setRevoke(connection)}>İptal et</Button>
      </li>)}</ul>}
      {revoke && <div><p>{revoke.name} bağlantısının erişimi kesilecek.</p><div className="row-actions"><Button variant="outline" disabled={busy} onClick={() => setRevoke(null)}>Vazgeç</Button><Button disabled={busy} onClick={() => void run(async () => {
        await api(`mcp/connections/${revoke.id}`, 'DELETE'); if (key?.id === revoke.id) setKey(null); setRevoke(null); await refresh();
      })}>İptali onayla</Button></div></div>}
    </div>
  </DialogShell>;
}
