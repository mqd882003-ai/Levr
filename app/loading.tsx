export default function HomeLoading() {
  return (
    <section className="screen screen-home" aria-label="Home" aria-busy="true">
      <div className="home-inner">
        <div className="skel" style={{ height: 14, width: 140, marginBottom: 16, borderRadius: 100 }} />
        <div className="skel" style={{ height: 40, width: "70%", marginBottom: 12 }} />
        <div className="skel" style={{ height: 18, width: "85%", marginBottom: 32, borderRadius: 100 }} />
        <div className="skel" style={{ height: 150, borderRadius: 28 }} />
      </div>
    </section>
  );
}
