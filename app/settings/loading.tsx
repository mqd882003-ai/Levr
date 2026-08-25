export default function SettingsLoading() {
  return (
    <section className="screen" aria-label="Settings" aria-busy="true">
      <div className="topbar">
        <h1>Settings</h1>
      </div>
      <div className="settings">
        <div className="skel skel-card" style={{ height: 120 }} />
        <div className="skel skel-card" style={{ height: 160 }} />
        <div className="skel skel-card" style={{ height: 220 }} />
      </div>
    </section>
  );
}
