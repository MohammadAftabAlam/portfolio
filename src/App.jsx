import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { profile, spec, experience, stack, contact } from "./data.js";
import "./styles.css";

// Three.js is large, so every scene loads after the page has painted.
const SystemScene = lazy(() => import("./three/SystemScene.jsx"));
const ExperienceScene = lazy(() => import("./three/ExperienceScene.jsx"));
const StackScene = lazy(() => import("./three/StackScene.jsx"));
const ContactScene = lazy(() => import("./three/ContactScene.jsx"));
const Backdrop = lazy(() => import("./three/Backdrop.jsx"));

const SECTIONS = [
  { id: "experience", label: "Experience" },
  { id: "stack", label: "Stack" },
  { id: "contact", label: "Contact" },
];

/* Marks the nav item for the section currently near the top of the screen. */
function useActiveSection() {
  const [active, setActive] = useState("");

  useEffect(() => {
    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return active;
}

function SlashList({ items }) {
  return (
    <ul className="slashes">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Header({ active }) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a className="topbar__name" href="#top">
          aftab
        </a>
        <nav aria-label="Sections">
          <ul className="topbar__nav">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className={active === section.id ? "is-active" : undefined}
                  aria-current={active === section.id ? "true" : undefined}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

// Text version of the diagram, shown while the 3D scene loads or if WebGL is missing.
function SceneFallback() {
  return (
    <div className="scene scene--fallback" aria-hidden="true">
      <p>Flutter apps ×3 → REST API → Spring Boot → Hibernate → MySQL</p>
    </div>
  );
}

/*
  A framed diagram. The 3D scene only exists while the frame is within about
  a screen of the viewport, so the page never holds more WebGL contexts than
  it needs. A plain text version shows until the scene is running.
*/
function Figure({ scene: Scene, fallback, className = "", ...sceneProps }) {
  const frameRef = useRef(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNear(entry.isIntersecting);
        if (!entry.isIntersecting) setReady(false);
      },
      { rootMargin: "500px 0px" }
    );
    observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`figure ${className}`} ref={frameRef}>
      {(!near || !ready || failed) && (
        <div className="scene scene--fallback" aria-hidden="true">
          <p>{fallback}</p>
        </div>
      )}
      {near && !failed && (
        <Suspense fallback={null}>
          <Scene {...sceneProps} onReady={() => setReady(true)} onError={() => setFailed(true)} />
        </Suspense>
      )}
    </div>
  );
}

function Hero() {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  return (
    <section className="hero" id="top">
      <div className="hero__intro">
        <h1 className="rise" style={{ "--d": "40ms" }}>
          {profile.name}
        </h1>
        <p className="hero__role rise" style={{ "--d": "110ms" }}>
          {profile.role}
        </p>
        <p className="hero__summary rise" style={{ "--d": "180ms" }}>
          {profile.summary}
        </p>

        <dl className="spec rise" style={{ "--d": "250ms" }}>
          {spec.map((row) => (
            <div key={row.key}>
              <dt>{row.key}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
          <div>
            <dt>Status</dt>
            <dd>
              <span className="marker" aria-hidden="true" />
              {profile.status}
            </dd>
          </div>
        </dl>

        <div className="actions rise" style={{ "--d": "320ms" }}>
          <a className="btn btn--primary" href="#contact">
            Get in touch
          </a>
          <a className="btn" href={contact.find((c) => c.label === "Resume")?.href}>
            Resume
          </a>
        </div>
      </div>

      <div className="hero__scene">
        {(!ready || failed) && <SceneFallback />}
        {!failed && (
          <Suspense fallback={null}>
            <SystemScene onReady={() => setReady(true)} onError={() => setFailed(true)} />
          </Suspense>
        )}
      </div>
    </section>
  );
}

function Experience() {
  return (
    <section id="experience" className="block" aria-labelledby="experience-title">
      <h2 id="experience-title" className="block__title">
        Experience
      </h2>
      {experience.map((item) => (
        <article className="job" key={item.id}>
          <div className="job__meta">
            <p className="job__period">{item.period}</p>
            {item.company && <p>{item.company}</p>}
            {item.client && <p className="job__dim">{item.client}</p>}
          </div>
          <div className="job__body">
            <h3>{item.title}</h3>
            {(item.jobTitle || item.subtitle) && (
              <p className="job__sub">{item.jobTitle || item.subtitle}</p>
            )}
            <ul className="bullets">
              {item.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <SlashList items={item.stack} />
          </div>
        </article>
      ))}
      <Figure
        scene={ExperienceScene}
        className="figure--wide"
        fallback="3 apps × (iOS + Android), each built once in Flutter"
      />
    </section>
  );
}

function Stack() {
  const activeRef = useRef(null); // the card being hovered, read by the 3D scene

  return (
    <section id="stack" className="block" aria-labelledby="stack-title">
      <h2 id="stack-title" className="block__title">
        Stack
      </h2>
      <div className="split">
        <div className="cells cells--two">
          {stack.map((group) => (
            <div
              className="cell"
              key={group.label}
              onPointerEnter={() => (activeRef.current = group.label)}
              onPointerLeave={() => (activeRef.current = null)}
            >
              <h3>{group.label}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Figure
          scene={StackScene}
          groups={stack}
          activeRef={activeRef}
          fallback="Platforms → Client → Backend → Data"
        />
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="block" aria-labelledby="contact-title">
      <h2 id="contact-title" className="block__title">
        Contact
      </h2>
      <div className="split">
        <div className="cells cells--rows">
          {contact.map((item) => (
            <a className="cell cell--link" key={item.label} href={item.href}>
              <h3>{item.label}</h3>
              <span>{item.value}</span>
            </a>
          ))}
        </div>
        <Figure scene={ContactScene} caption={profile.status} fallback={profile.status} />
      </div>
    </section>
  );
}

export default function App() {
  const active = useActiveSection();

  return (
    <>
      <Suspense fallback={null}>
        <Backdrop />
      </Suspense>
      <Header active={active} />
      <main className="page">
        <Hero />
        <Experience />
        <Stack />
        <Contact />
      </main>
      <footer className="footer">
        <div className="footer__inner">
          <span>
            © {new Date().getFullYear()} {profile.name}
          </span>
          {/* <span>React, Three.js</span> */}
        </div>
      </footer>
    </>
  );
}
