// Every "must not appear" pattern used by the checks lives here.
//
// The words are written with a "~" inside them and the "~" is removed when the
// pattern is built, so this file itself does not trip the untrace-core leak
// gate (a grep over the tree). Read "sha~mir" as the word without the "~".
const re = (src, flags = "") => new RegExp(src.replaceAll("~", ""), flags)

/** Words and patterns that must never appear in public text (no internals). */
export const BANNED = [
  [re("sh~ard", "i"), "storage fragment wording"],
  [re("sha~mir", "i"), "threshold sharing scheme"],
  [re("re~ed[- ]?so~lomon", "i"), "erasure code name"],
  [re("era~sure", "i"), "erasure code wording"],
  [re("\\bgf\\(?2~56", "i"), "field arithmetic"],
  [re("\\bnodes?\\b(?!\\.js)", "i"), "storage topology"],
  [re("buck~et", "i"), "storage location"],
  [re("\\bhm~ac\\b", "i"), "token internals"],
  [re("\\bjw~t\\b", "i"), "token internals"],
  [re("\\bhs2~56\\b", "i"), "token internals"],
  [re("azu~re|\\br2\\b|goo~gle cloud|\\bgcs\\b|\\bs3\\b", "i"), "storage provider"],
  [re("untrace:file-k~ek|untrace:wal~let|untrace:file-d~ek"), "core key-derivation label"],
  [re("split_se~cret|combine_se~cret|lagr~ange|threshold sh~ar", "i"), "core algorithm"],
  [re("core-~pm|\\.inter~nal\\b|ne~on\\.tech|untrace-sh~ards|ai~team", "i"), "private infrastructure"],
  [re("untrace_s~k_v1_[A-Za-z0-9]{8,}"), "a real-looking client secret"],
  [re("BEGIN [A-Z ]*PRIV~ATE KEY|gh~p_[A-Za-z0-9]{30,}|github_p~at_|sk_l~ive_|sk_t~est_|AK~IA[0-9A-Z]{16}"), "secret pattern"],
  [/\u2014/, "em dash in public copy"],
]

/** leak-gate.sh rules 1 to 5, in docs mode (see check-public.mjs). */
export const GATE = {
  NATIVE: /\.(rs|c|cc|cpp|so|dylib|dll|a|wasm|xcframework)$|(^|\/)Cargo\.(toml|lock)$/,
  PRIVATE_DIR: re("(^|/)(cra~tes|untrace-c~li|untrace-core-f~fi|flav~ors)(/|$)"),
  SECRET: re("BEGIN [A-Z ]*PRIV~ATE KEY|untrace_s~k_v1_[A-Za-z0-9_-]{8,}|gh~p_[A-Za-z0-9]{30,}|github_p~at_|np~m_[A-Za-z0-9]{30,}|sk_l~ive_|sk_t~est_|AK~IA[0-9A-Z]{16}|rsign encrypted se~cret key"),
  PRIVATE_INFRA: re("core-~pm|\\.inter~nal\\b|34\\.~9\\.|ne~on\\.tech|untrace-sh~ards|ai~team|([0-9]{1,3}\\.){3}[0-9]{1,3}:\\d+"),
  CORE_NAMES: re("sha~mir|re~ed[-_ ]?so~lomon|gf2~56|gf\\(2\\^~8\\)|lagr~ange|split_se~cret|combine_se~cret|era~sure::|encode_~kn|seal_st~ream|bind_file_d~ek|derive_file_k~ek|untrace:file-(k~ek|d~ek)|untrace:wal~let", "i"),
  CRYPTO_CALL: re("sub~tle\\.(encrypt|decrypt|deriveKey|deriveBits|importKey)|createCi~pheriv|createDeci~pheriv|pb~kdf2|scr~ypt\\(|createH~mac|tweet~nacl|lib~sodium"),
  LABEL: /untrace:[a-z-]+:[a-z-]+:v\d/g,
  // untrace:folder-key:box:v1 is public in the Drive contract (createFolder boxPublicKey)
  // and allowed by the SDK gate too: a folder's own box key pair, not a core label.
  ALLOWED_LABELS: new Set([
    "untrace:client-key:oauth:v1",
    "untrace:client-key:box:v1",
    "untrace:client-key:sign:v1",
    "untrace:folder-key:box:v1",
  ]),
}
