export type ModuleKind = "t2i" | "i2i" | "i2v";

export type LoraSlot = { name: string; strength: number };

export type Config = {
  recipe: string;
  preset: string;
  width: number;
  height: number;
  steps: number;
  cfg?: number;
  negative?: string;
  seed: number;
  count: number;
  face_fix: boolean;
  tiled: boolean;
  ultrasharp: boolean;
  skin_lora: boolean;
  skin_lora_strength: number;
  face_fix_denoise: number;
  tiled_denoise: number;
  hires_denoise: number;
  upscale: number;
  draft_only?: boolean;
  ref_denoise?: number;
  frames?: number;
  fps?: number;
  comparar?: boolean;
  hires?: number;
  loras: LoraSlot[];
};

export type Asset = {
  id: string;
  session_id: string;
  message_id: string;
  kind: "image" | "video";
  path: string;
  role: string;
  seed?: number;
};

export type Message = {
  id: string;
  session_id: string;
  type: "user" | "job" | "result";
  prompt?: string;
  image_asset_id?: string;
  config_snapshot?: Config;
  job_status?: string;
  log_text?: string;
  created_at: string;
  assets?: Asset[];
  workflow?: Record<string, unknown> | null;
};

export type Session = {
  id: string;
  title: string;
  module: ModuleKind;
  config: Config;
  reference_asset_id?: string | null;
  created_at: string;
  updated_at: string;
  thumb_asset_id?: string | null;
  messages?: Message[];
  assets?: Asset[];
};

export type Recipe = {
  id: string;
  name: string;
  module: ModuleKind;
  family?: string;
  note?: string;
  refs_min: number;
  refs_max: number;
  available: boolean;
  missing: string[];
  caps: Record<string, boolean>;
  defaults: Config;
  presets: Record<string, { width: number; height: number }>;
  supports: Record<string, boolean>;
};

export type Health = {
  comfy_ok: boolean;
  comfy_url: string;
  ollama_loaded: string[];
  recipes: Recipe[];
  busy: boolean;
};

export type PromptField = {
  id: string;
  label: string;
  options: { label: string; text: string }[];
};

export type LoraInfo = {
  name: string;
  family: string;
  favorite: boolean;
  last_used?: string;
  thumb?: boolean;
  thumb_url?: string | null;
  trigger?: string;
  trigger_choices?: string[];
};
