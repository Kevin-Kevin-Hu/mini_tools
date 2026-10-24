import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTools } from "../api.js";

export default function Hub() {
  const [tools, setTools] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    getTools()
      .then(setTools)
      .catch((e) => setErr(String(e)));
  }, []);

  // 按学科分组
  const groups = {};
  tools.forEach((t) => {
    (groups[t.subject] ||= []).push(t);
  });

  return (
    <div className="wrap">
      <h1>mini_tools · 可视化教学工具</h1>
      <p className="sub">把抽象难懂的学科知识，用动态图形讲明白。适用于小学生（数学 / 科学等）。</p>
      {err && <p className="hint">加载工具列表失败（请确认后端已启动）：{err}</p>}
      {tools.length === 0 && !err && <p className="hint">暂无工具。</p>}
      {Object.entries(groups).map(([subject, list]) => (
        <section className="card" key={subject}>
          <h2>{subject}</h2>
          <div className="cards">
            {list.map((t) => (
              <Link className="tool-card" key={t.id} to={`/tool/${t.id}`}>
                <div className="tool-title">{t.title}</div>
                <div className="tool-meta">{t.grade || ""}</div>
                <div className="tool-summary">{t.summary}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
