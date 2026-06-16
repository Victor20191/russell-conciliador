import "./index.css";
import { Composition } from "remotion";
import {
  ClientesParametrizaciones,
  DURATION_IN_FRAMES,
  FPS,
} from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ClientesParametrizaciones"
        component={ClientesParametrizaciones}
        durationInFrames={DURATION_IN_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
