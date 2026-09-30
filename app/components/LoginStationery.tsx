import s from "./login-stationery.module.css";

// Decorative only; keep this layer independent so the login texture is easy to adjust.
export default function LoginStationery() {
  return (
    <div className={s.texture} aria-hidden="true">
      <svg className={s.clip} viewBox="0 0 64 64" fill="none" focusable="false">
        <path d="M24 43V18a10 10 0 0 1 20 0v29a15 15 0 0 1-30 0V21m16 23V19a4 4 0 0 1 8 0v27a9 9 0 0 1-18 0V22" />
      </svg>
      <svg className={s.pencil} viewBox="0 0 64 64" fill="none" focusable="false">
        <path d="M20 10h24v30L32 57 20 40Zm0 30 8-5 8 5 8-5M28 10v25m8-25v30m-9 10h10" />
      </svg>
      <svg className={s.ruler} viewBox="0 0 112 36" fill="none" focusable="false">
        <rect x="3" y="3" width="106" height="30" rx="4" />
        <path d="M17 3v16M29 3v9M41 3v16M53 3v9M65 3v16M77 3v9M89 3v16" />
      </svg>
      <svg className={s.notebook} viewBox="0 0 88 64" fill="none" focusable="false">
        <path d="M44 14C33 6 19 6 7 10v42c14-4 26-3 37 5 11-8 23-9 37-5V10c-12-4-26-4-37 4Zm0 0v43M15 22c8-2 15-1 22 3m-22 7c8-2 15-1 22 3m-22 7c8-2 15-1 22 3m14-20c7-4 14-5 22-3m-22 13c7-4 14-5 22-3m-22 13c7-4 14-5 22-3" />
      </svg>
      <svg className={s.smallClip} viewBox="0 0 64 64" fill="none" focusable="false">
        <path d="M24 43V18a10 10 0 0 1 20 0v29a15 15 0 0 1-30 0V21m16 23V19a4 4 0 0 1 8 0v27a9 9 0 0 1-18 0V22" />
      </svg>
      <svg className={s.smallPencil} viewBox="0 0 64 64" fill="none" focusable="false">
        <path d="M20 10h24v30L32 57 20 40Zm0 30 8-5 8 5 8-5M28 10v25m8-25v30m-9 10h10" />
      </svg>
    </div>
  );
}
