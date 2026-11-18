import {
  ArrowDown, ArrowDownAZ, File, FileArchive, FileAudio, FileCode, FileSpreadsheet, FileText, ArrowUp, ChevronLeft, ChevronRight, ClipboardPaste, Columns2, Copy, FileImage, LoaderCircle, SlidersHorizontal, Settings, PanelRightClose, PanelRightOpen, Folder, HardDrive, LayoutGrid,
  Grid2x2, List, ListChecks, ListFilter, Maximize, Monitor, PanelLeftClose, PanelLeftOpen, RectangleHorizontal, Scissors, Star, Trash2,
  Weight, WandSparkles, X, type LucideIcon, type LucideProps,
} from "lucide-react";

/** Íconos del pack Lucide con el tamaño y grosor de trazo de la app. Los nombres se mantienen para no tocar los usos. */
const base = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export const ChevronGlyph = ({ dir }: { dir: "left" | "right" }) => (dir === "left" ? <ChevronLeft {...base} size={28} /> : <ChevronRight {...base} size={28} />);
export const ToolsGlyph = ({ open }: { open?: boolean }) => (open ? <PanelRightClose {...base} /> : <PanelRightOpen {...base} />);
export const SettingsGlyph = () => <Settings {...base} />;
export const EditGlyph = () => <SlidersHorizontal {...base} />;
export const CopyGlyph = () => <Copy {...base} />;
/** Ícono que gira: indica que algo está procesando. */
export const SpinnerGlyph = () => <LoaderCircle {...base} className="spin" />;
export const CutGlyph = () => <Scissors {...base} />;
export const PasteGlyph = () => <ClipboardPaste {...base} />;
export const TrashGlyph = () => <Trash2 {...base} />;
export const CompareGlyph = () => <Columns2 {...base} />;
export const CloseGlyph = () => <X {...base} />;
export const PanelGlyph = ({ open }: { open?: boolean }) => (open ? <PanelLeftOpen {...base} /> : <PanelLeftClose {...base} />);
export const UpGlyph = () => <ArrowUp {...base} />;
export const DownGlyph = () => <ArrowDown {...base} />;
export const LinesGlyph = () => <List {...base} />;
export const GridGlyph = () => <LayoutGrid {...base} />;
export const LargeGlyph = () => <Grid2x2 {...base} />;
export const NameGlyph = () => <ArrowDownAZ {...base} />;
export const TypeGlyph = () => <FileImage {...base} />;
export const SizeGlyph = () => <Weight {...base} />;
export const StudioGlyph = () => <WandSparkles {...base} />;
export const FilterGlyph = () => <ListFilter {...base} />;
export const SelectTypeGlyph = () => <ListChecks {...base} />;
export const FitGlyph = () => <Maximize {...base} />;
export const RatioGlyph = () => <RectangleHorizontal {...base} />;
export const FolderGlyph = () => <Folder {...base} size={22} fill="currentColor" fillOpacity={0.3} />;

/** Íconos del árbol: llevan la clase de color de cada tipo. */
const node = (p: LucideProps) => ({ ...base, ...p });
export const PcGlyph = () => <Monitor {...node({ className: "node-ico pc" })} />;
export const FavGlyph = () => <Star {...node({ className: "node-ico pc" })} />;
export const DriveGlyph = () => <HardDrive {...node({ className: "node-ico drive" })} />;
export const FolderMini = () => <Folder {...node({ className: "node-ico folder", fill: "currentColor", fillOpacity: 0.3 })} />;

/** Ícono según el tipo de archivo (para lo que no es foto ni video). */
const FILE_ICONS: Record<string, LucideIcon> = {
  pdf: FileText, doc: FileText, docx: FileText, txt: FileText, md: FileText, rtf: FileText, odt: FileText,
  xls: FileSpreadsheet, xlsx: FileSpreadsheet, csv: FileSpreadsheet, ods: FileSpreadsheet,
  zip: FileArchive, rar: FileArchive, "7z": FileArchive, tar: FileArchive, gz: FileArchive,
  mp3: FileAudio, wav: FileAudio, flac: FileAudio, ogg: FileAudio, m4a: FileAudio,
  json: FileCode, xml: FileCode, html: FileCode, css: FileCode, ts: FileCode, py: FileCode,
  psd: FileImage, ai: FileImage, svg: FileImage, heic: FileImage, raw: FileImage, cr2: FileImage, nef: FileImage, dng: FileImage,
};

export const FileGlyph = ({ name, size = 16 }: { name: string; size?: number }) => {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const Icon = FILE_ICONS[ext] ?? File;
  return <Icon {...base} size={size} />;
};
