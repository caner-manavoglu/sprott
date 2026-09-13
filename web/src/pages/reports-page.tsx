import { AlertTriangle, BarChart3, CheckCircle2, LockKeyhole } from 'lucide-react';
import { Button } from '../components/ui';
import { dateLabel, fullName, initials } from '../lib/format';
import type { Report, ReportDetail } from '../lib/types';

const footnote = <div className="permissions-foot">
  <LockKeyhole size={14}/> Tamamlanan task, her projenin son sütunundaki task’lardır. Atanan task, kişiye şu anda atanmış tüm task’lardır. Atanan bug, tüm sütunlarda şu anda kişiye atanmış bug sayısıdır; tamamlanan bug’lar da dahildir.
  Süresi geçen task, bitiş tarihi bugünden önce olan ve son sütuna taşınmamış task’tır.
</div>;

const scopeText = (report: Report | null) => {
  if (report?.scope === 'all') return 'Tüm personelin tamamladığı task sayıları.';
  if (report?.scope === 'group') return `Yönettiğiniz gruplar: ${report.groups.join(', ')}.`;
  return 'Yalnızca kendi raporunuzu görüyorsunuz.';
};

/** Kişi bazlı kırılım: seçilen personelin proje proje tamamladığı task’lar. */
export function ReportDetailPage({detail, onBack}: {detail: ReportDetail; onBack: () => void}) {
  return <div className="permissions-panel">
    <div className="permissions-heading">
      <div className="permission-icon"><BarChart3 size={21}/></div>
      <div>
        <h2>{fullName(detail.person)}</h2>
        <p>{detail.person.title || 'Personel'} · üyesi olduğu projelerde tamamladığı task sayısı.</p>
      </div>
      <span className="report-total">{detail.total} tamamlanan</span>
      {!!detail.overdue.length && <span className="report-total late">
        <AlertTriangle size={13}/> {detail.overdue.length} süresi geçen
      </span>}
      <Button variant="outline" size="sm" onClick={onBack}>Raporlara dön</Button>
    </div>

    <div className="table-scroll"><table>
      <thead><tr><th>Proje</th><th>Atanan task</th><th>Tamamlanan task</th><th>Atanan bug</th><th>Süresi geçen</th></tr></thead>
      <tbody>
        {detail.rows.map(row => <tr key={row.projectId}>
          <td><strong>{row.projectName}</strong></td>
          <td><strong>{row.assigned}</strong></td>
          <td><strong>{row.completed}</strong></td>
          <td><strong>{row.bugs}</strong></td>
          <td>{row.overdue ? <span className="task-due late"><AlertTriangle size={11}/>{row.overdue}</span> : <strong>0</strong>}</td>
        </tr>)}
        {!detail.rows.length && <tr><td colSpan={5} className="muted">Bu personel hiçbir projeye eklenmemiş.</td></tr>}
      </tbody>
    </table></div>

    <OverdueList tasks={detail.overdue}/>

    {footnote}
  </div>;
}

/** Kişinin süresi geçen task'ları: hangi task, hangi projede ve kaç gün gecikmiş. */
function OverdueList({tasks}: {tasks: ReportDetail['overdue']}) {
  return <>
    <div className="permissions-heading">
      <span className={`permission-icon${tasks.length ? ' late' : ''}`}>
        {tasks.length ? <AlertTriangle size={19}/> : <CheckCircle2 size={19}/>}
      </span>
      <div>
        <h2>Süresi geçen task’lar</h2>
        <p>{tasks.length ? `${tasks.length} task bitiş tarihini geçti.` : 'Bu personelin süresi geçen task’ı yok.'}</p>
      </div>
    </div>
    {!!tasks.length && <div className="table-scroll"><table>
      <thead><tr><th>Task</th><th>Proje · sütun</th><th>Bitiş</th><th>Gecikme</th></tr></thead>
      <tbody>{tasks.map(task => <tr key={task.id}>
        <td><strong>{task.title}</strong></td>
        <td>{task.projectName} · {task.columnName}</td>
        <td>{dateLabel(task.dueDate)}</td>
        <td><span className="task-due late"><AlertTriangle size={11}/>{task.daysLate} gün</span></td>
      </tr>)}</tbody>
    </table></div>}
  </>;
}

export function ReportsPage({report, busy, onOpenPerson}: {report: Report | null; busy: boolean; onOpenPerson: (id: number) => void}) {
  return <div className="permissions-panel">
    <div className="permissions-heading">
      <div className="permission-icon"><BarChart3 size={21}/></div>
      <div><h2>Tamamlanan task raporu</h2><p>{scopeText(report)}</p></div>
      <span className="report-total">{report?.total ?? 0} tamamlanan</span>
    </div>

    <div className="table-scroll"><table>
      <thead><tr><th>Personel</th><th>Ünvan</th><th>Atanan task</th><th>Tamamlanan task</th><th>Atanan bug</th><th>Süresi geçen</th><th>Aksiyonlar</th></tr></thead>
      <tbody>
        {report?.rows.map(row => <tr key={row.id}>
          <td><div className="person">
            <span className="user-avatar">{initials(row)}</span>
            <div><strong>{fullName(row)}</strong><small>{row.title}</small></div>
          </div></td>
          <td>{row.title}</td>
          <td><strong>{row.assigned}</strong></td>
          <td><strong>{row.completed}</strong></td>
          <td><strong>{row.bugs}</strong></td>
          <td>{row.overdue ? <span className="task-due late"><AlertTriangle size={11}/>{row.overdue}</span> : <strong>0</strong>}</td>
          <td><Button variant="outline" size="sm" disabled={busy} onClick={() => onOpenPerson(row.id)}>
            <BarChart3 size={15}/> Raporu gör
          </Button></td>
        </tr>)}
        {!report?.rows.length && <tr><td colSpan={7} className="muted">Rapor için personel yok.</td></tr>}
      </tbody>
    </table></div>

    {footnote}
  </div>;
}
