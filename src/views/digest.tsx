import type { DigestRow, Night } from '../digest/types.js';

const dash = '—';

// Text marks, not colour alone: "fail" for a failed last status, "retries" for 3 or more.
function marks(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.lastStatus === 'fail') out.push('fail');
  if (row.retries >= 3) out.push('retries');
  return out;
}

export function DigestPage({ night, data }: { night: string; data: Night }) {
  return (
    <>
      <h1>digest {night}</h1>
      {data.badLines > 0 && <p class="warn">{data.badLines} lines could not be read</p>}
      {data.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
              <th>mark</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const m = marks(row);
              return (
                <tr>
                  <td>{row.job}</td>
                  <td>{row.owner ?? dash}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? dash}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                  <td class={m.length > 0 ? 'warn' : 'mute'}>{m.length > 0 ? m.join(' · ') : dash}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

export function DigestNotFound({ night }: { night: string }) {
  return (
    <>
      <h1>digest</h1>
      <p class="warn">night not found: {night}</p>
    </>
  );
}
