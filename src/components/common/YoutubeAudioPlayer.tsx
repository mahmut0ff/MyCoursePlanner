import React from 'react';

interface Props {
  youtubeUrl: string;
}

const YoutubeAudioPlayer: React.FC<Props> = ({ youtubeUrl }) => {
  const getUrlParams = (url: string) => {
    try {
      if (!url) return null;
      const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  const videoId = getUrlParams(youtubeUrl);

  if (!videoId) return null;

  return (
    <div className="bg-slate-100 border border-slate-300 w-full overflow-hidden aspect-video relative flex-shrink-0">
      <iframe
        className="absolute top-0 left-0 w-full h-full"
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&controls=1`}
        title="Background Study Music"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      ></iframe>
    </div>
  );
};

export default YoutubeAudioPlayer;
