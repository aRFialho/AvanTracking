import { useEffect, useRef } from "react";

export const LightningStorm = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let animationFrame: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    const drawLightning = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const startX = Math.random() * canvas.width;
      const startY = 0;
      const segments = 20;
      const segmentLength = canvas.height / segments;

      ctx.beginPath();
      ctx.moveTo(startX, startY);

      let currentX = startX;
      let currentY = startY;

      for (let i = 0; i < segments; i++) {
        const offset = (Math.random() - 0.5) * 80;
        currentX += offset;
        currentY += segmentLength;

        ctx.lineTo(currentX, currentY);

        // ramificação
        if (Math.random() > 0.7) {
          ctx.moveTo(currentX, currentY);
          ctx.lineTo(currentX + offset * 0.5, currentY + segmentLength * 0.5);
        }
      }

      ctx.strokeStyle = "rgba(0,243,255,1)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 20;
      ctx.shadowColor = "rgba(0,243,255,1)";
      ctx.stroke();

      // flash leve na tela
      document.body.style.backgroundColor =
        Math.random() > 0.5 ? "#0f1a2f" : "#0B0C15";
    };

    const loop = () => {
      if (Math.random() > 0.97) {
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
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
};
