/**
 * Picture (ADR-138 batch B7): a card picture shown whole. object-contain, never cropped, stretched or filtered (Scryfall image
 * rules). When the picture is missing or fails to load, a short plain note takes its place. An optional credit line sits under it.
 */
import React, { useEffect, useState } from 'react';

export interface PictureProps {
  url: string | null;
  alt: string;
  /** Shown when there is no picture. */
  emptyText: string;
  credit?: string | null;
}

const Picture: React.FC<PictureProps> = ({ url, alt, emptyText, credit }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  return (
    <figure className="m-0 min-w-0">
      <div className="flex h-40 w-28 items-center justify-center overflow-hidden rounded border border-warm-200 bg-warm-100 dark:border-gray-600 dark:bg-gray-700 sm:h-48 sm:w-36">
        {url && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt} loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(true)} />
        ) : (
          <span className="px-2 text-center text-xs leading-tight text-warm-600 dark:text-warm-300">{emptyText}</span>
        )}
      </div>
      {credit && url && !failed ? <figcaption className="mt-1 max-w-[7rem] break-words text-[11px] text-warm-600 dark:text-warm-300 sm:max-w-[9rem]">{credit}</figcaption> : null}
    </figure>
  );
};

export default Picture;
