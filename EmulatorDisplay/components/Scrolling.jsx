/* eslint-disable react/prop-types */
import Buttons from "./Buttons";
import { useRef, useEffect, useState } from "react";
import { ReactComponent as ArrowUpIcon } from "../../../../src/assets/images/icons/arrow-up.svg";
import styles from "./scrolling.module.css";

export default function Scrolling({
  scrollObj,
  currentScreen,
  data,
  updateCurrentScreen,
  assetsPath,
  currentVersion,
  prevScrollPos,
  setPrevScrollPos,
  returnPressed,
  setReturnPressed,
  currentPreset
}) {

  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);
  const [currentScrollPos, setCurrentScrollPos] = useState(0)

  const scrollarea = useRef();
  const scrollPortion = useRef();
  const buttonUp = currentPreset.scroll_buttons.up
  const buttonDown = currentPreset.scroll_buttons.down

  useEffect(() => {
    if (currentScreen && scrollarea?.current && returnPressed && prevScrollPos[currentScreen.key]) {
      const scrollPos = prevScrollPos[currentScreen.key] ?? 0;
      scrollarea.current.scrollTop = scrollPos > 0 ? scrollPos : 0;
      // setAtTop(true)
      // setAtBottom(false)
      setCurrentScrollPos(scrollPos)
      
    } else {
      scrollarea.current.scrollTop = 0;
      setAtTop(true)
      setAtBottom(false)
      setCurrentScrollPos(0)
    }
    setReturnPressed(false)
  }, [currentScreen]);

  useEffect(() => {
    if (currentScreen && scrollarea?.current) {
    const scrollHeight = scrollarea.current.scrollHeight;
    const clientHeight = scrollarea.current.clientHeight;
    const maxScrollTop = scrollHeight - clientHeight;

    if (currentScrollPos === 0) {
      setAtTop(true)
      setAtBottom(false)
    } else if (currentScrollPos >= maxScrollTop -1) {
      setAtTop(false)
      setAtBottom(true)
    } else {
      setAtTop(false)
      setAtBottom(false)
    }
  }


  },[currentScrollPos, currentScreen])

  const changePos = (top, behavior) => {
    if (scrollarea.current) {
      scrollarea.current.scrollTo({
        top,
        left: 0,
        behavior,
      });
    }
  };

  const handleScroll = (e) => {
    const delta = e.deltaY || e.detail || e.wheelDelta;
  
    const scrollHeight = scrollarea.current.scrollHeight;
    const clientHeight = scrollarea.current.clientHeight;
    const maxScrollTop = scrollHeight - clientHeight;
  
    const newScrollTop = scrollarea.current.scrollTop + (delta > 0 ? 150 : -150);
    const scrollTop = Math.max(0, Math.min(maxScrollTop, newScrollTop));
  
    const start = scrollarea.current.scrollTop;
    const change = scrollTop - start;
    const duration = 500; // milliseconds
    let startTime = null;
  
    const smoothAnimateScroll = (currentTime) => {
      if (!startTime) {
        startTime = currentTime;
      }
  
      const elapsed = currentTime - startTime;
      const easing = (t) => 1 - Math.pow(1 - t, 2); // faster initial ease
      scrollarea.current.scrollTop = start + change * easing(elapsed / duration);
  
      if (elapsed < duration) {
        requestAnimationFrame(smoothAnimateScroll);
      }
    };
  
    requestAnimationFrame(smoothAnimateScroll);
    setCurrentScrollPos((prev) => scrollTop);
    setPrevScrollPos((prev) => ({ ...prev, [currentScreen.key]: scrollTop }));
  };

  return (
    <>
      <button
        style={{
          position: "absolute",
          top: buttonUp? buttonUp.top : 45,
          left: buttonUp? buttonUp.left : 410,
          zIndex: 2,
          transform: "rotate(180deg)",
          display: "flex",
          height: "30px",
          width: "30px",
          borderRadius: "50%",
          boxShadow: "rgba(0, 0, 0, 0.5) 0px 0px 4px",
          border: "2px solid dodgerblue",
          cursor: "pointer",
          backgroundColor: "transparent",
          opacity: atTop ? 0.5 : 1,
        }}
        className={styles["transition"]}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const scrollTop = scrollarea.current.scrollTop;

          if (!atTop) {
            const height = 190;
            if (scrollTop > 0) {
              changePos(
                scrollTop - height > 0 ? scrollTop - height : 0,
                "smooth"
              );
              // if (scrollTop - height <= 0) {
              //   setAtTop((p) => {
              //     return true;
              //   });
              //   if (atBottom) {
              //     setAtBottom((p) => {
              //       return false;
              //     });
              //   }
              // } else if (atTop) {
              //   setAtTop((p) => {
              //     return false;
              //   });
              // }
            }
          }
          setTimeout(() => {
            const newscrollTop = scrollarea.current.scrollTop;
            setCurrentScrollPos((prev) => {return newscrollTop});
            setPrevScrollPos((prev) => ({ ...prev, [currentScreen.key]: newscrollTop }));
          }, 300);
        }}
      >
        <ArrowUpIcon />

      </button>
      <div
        id={"scroll-div"}
        style={{
          overflowY: "hidden",
          overflowX: "none",
          position: "absolute",
          borderRadius: scrollObj?.borderRadius || 0,
          height: scrollObj.height,
          width: scrollObj.width,
          top: scrollObj.top,
          left: scrollObj.left,
          zIndex: 3,
        }}
        ref={scrollarea}
        onWheel={handleScroll}
      >
        <div style={{ position: "relative", width: "100%", height: "auto" }}>
          {data?.buttons ? (
            <Buttons
              data={data?.buttons}
              updateCurrentScreen={updateCurrentScreen}
            />
          ) : null}

          <img
            draggable={false}
            id="screen_scroll_image"
            ref={scrollPortion}
            onLoad={() => {
              document.getElementById("screen_scroll_image").style.zIndex = 2;
              setTimeout(() => {
                if (
                  document.getElementById("screen_scroll_image") &&
                  document.getElementById("screen_scroll_image").style
                    .zIndex !== 2
                ) {
                  document.getElementById(
                    "screen_scroll_image"
                  ).style.zIndex = 2;
                }
              }, 300);
              document
                .getElementById("scroll-div")
                .querySelector(".mantine-ScrollArea-viewport").scrollTop = 0;
            }}
            src={`${
              assetsPath +
              "/images/screens/emulator/" +
              currentVersion +
              "/" +
              data.img_filename
            }.jpg`}
            style={{
              position: "absolute",
              width: "100%",
              height: "auto",
              top: 0,
              left: 0,
              pointerEvents: "none",
              userSelect: "none",
              zIndex: 0,
            }}
            alt="screen"
          />
        </div>
      </div>
      <button
        style={{
          position: "absolute",
          top: buttonDown? buttonDown.top : 330,
          left: buttonDown? buttonDown.left : 410,
          zIndex: 2,
          display: "flex",
          height: "30px",
          width: "30px",
          borderRadius: "50%",
          boxShadow: "rgba(0, 0, 0, 0.5) 0px 0px 4px",
          border: "2px solid dodgerblue",
          cursor: "pointer",
          paddingTop: 3,
          backgroundColor: "transparent",
          opacity: atBottom ? 0.4 : 1,
        }}
        className={styles["transition"]}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const scrollTop = scrollarea.current.scrollTop;

          if (!atBottom) {
            setAtTop(false);
            const long_height = scrollPortion.current.height;
            const height = 190;

            if (scrollTop + height <= long_height) {
              changePos(scrollTop + height, "smooth");
              // if (scrollTop + height * 2 >= long_height) {
              //   setAtBottom((p) => {
              //     return true;
              //   });
              //   if (atTop) {
              //     setAtTop((p) => {
              //       return false;
              //     });
              //   }
              // } else if (atBottom) {
              //   if (atTop) {
              //     setAtTop((p) => {
              //       return false;
              //     });
              //   }
              //   setAtBottom((p) => {
              //     return false;
              //   });
              // }
            }
          }
          setTimeout(() => {
            const newscrollTop = scrollarea.current.scrollTop;
            setCurrentScrollPos((prev) => {return newscrollTop});
            setPrevScrollPos((prev) => ({ ...prev, [currentScreen.key]: newscrollTop }));
          }, 300);
        }}
      >
        <ArrowUpIcon />
      </button>
    </>
  );
}
