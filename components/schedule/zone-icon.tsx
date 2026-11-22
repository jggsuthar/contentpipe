import {
  Brain,
  Briefcase,
  Camera,
  Film,
  Laptop,
  Layers,
  Mic,
  PenTool,
  Sparkles,
  Video,
} from "lucide-react";

interface ZoneIconProps {
  icon?: string | null;
  className?: string;
}

export function ZoneIcon({ icon, className = "w-3.5 h-3.5" }: ZoneIconProps) {
  switch (icon) {
    case "Brain":
      return <Brain className={className} />;
    case "Video":
      return <Video className={className} />;
    case "Film":
      return <Film className={className} />;
    case "Mic":
      return <Mic className={className} />;
    case "PenTool":
      return <PenTool className={className} />;
    case "Sparkles":
      return <Sparkles className={className} />;
    case "Layers":
      return <Layers className={className} />;
    case "Laptop":
      return <Laptop className={className} />;
    case "Camera":
      return <Camera className={className} />;
    case "Briefcase":
    default:
      return <Briefcase className={className} />;
  }
}
