const key = "expense-tracker.v2.profile-draft";
const browserStorage = () => typeof window === "undefined" ? undefined : window.sessionStorage;
export function createProfileDrafts(storage: () => Pick<Storage,"getItem"|"setItem"|"removeItem"> | undefined = browserStorage) {
  return {
    save(userId: string, displayName: string) {
      const name=displayName.trim();
      if (!/^[0-9a-f-]{36}$/i.test(userId) || !name || Array.from(name).length>100 || Array.from(name).some(c=>{const n=c.codePointAt(0)!;return n<32||n===127||(n>=0xD800&&n<=0xDFFF);})) return;
      try { storage()?.setItem(key,JSON.stringify({userId,displayName:name})); } catch { /* Storage may be disabled; null profile remains valid. */ }
    },
    read(userId: string): string | null {
      try { const draft=JSON.parse(storage()?.getItem(key) ?? "null"); return draft?.userId===userId && typeof draft.displayName==='string' && draft.displayName.trim() && Array.from(draft.displayName).length<=100 ? draft.displayName : null; } catch { return null; }
    },
    clear(userId: string) {
      try { const draft=JSON.parse(storage()?.getItem(key) ?? "null"); if(draft?.userId===userId) storage()?.removeItem(key); } catch { /* No persisted draft. */ }
    },
  };
}
export const profileDrafts = createProfileDrafts();
