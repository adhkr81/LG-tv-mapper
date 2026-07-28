export default function Bezel({ bezelObj, assetsPath }) {
  return (
    <img
      src={`${assetsPath}/images/device/${bezelObj.src}.${bezelObj.extension}`}
      alt="Bezel"
      className={`tv-bezel`}
      style={{
        position: "absolute",
        height: bezelObj.height,
        width: bezelObj.width,
        top: bezelObj.top,
        left: bezelObj.left,
        zIndex: bezelObj.front ? 4 : 2,
      }}
    />
  );
}
