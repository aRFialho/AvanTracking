import { useEffect, useRef } from "react";

export const LogoLightning = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let animationFrame: number;

    const resize = () => {
      const parent = canvas.parentElement!;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    const drawLightning = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const startX = canvas.width / 2;
      const startY = 0;
      const segments = 15;
      const segmentLength = canvas.height / segments;

      ctx.beginPath();
      ctx.moveTo(startX, startY);

      let currentX = startX;
      let currentY = startY;

      for (let i = 0; i < segments; i++) {
        const offset = (Math.random() - 0.5) * 40;
        currentX += offset;
        currentY += segmentLength;

        ctx.lineTo(currentX, currentY);

        // pequenas ramificações
        if (Math.random() > 0.75) {
          ctx.moveTo(currentX, currentY);
          ctx.lineTo(currentX + offset * 0.5, currentY + segmentLength * 0.5);
        }
      }

      ctx.strokeStyle = "rgba(0,243,255,1)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 25;
      ctx.shadowColor = "rgba(0,243,255,1)";
      ctx.stroke();
    };

    const loop = () => {
      if (Math.random() > 0.96) {
        drawLightning();
      }
      animationFrame = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0"
    />
  );
};
