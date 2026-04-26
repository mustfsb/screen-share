"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Clipboard,
  Loader2,
  Mic,
  MicOff,
  MonitorStop,
  MonitorUp,
  Radio,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createPeerId, type RoomRole } from "@/lib/room";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { getDisplayMediaOptions, resolveIceServers } from "@/lib/webrtc";

type PresencePayload = {
  peerId: string;
  role: RoomRole;
  joinedAt: string;
};

type SignalPayload = {
  from: string;
  to: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  viewerId?: string;
};

type ConnectionStatus =
  | "Hazirlaniyor"
  | "Odaya baglandi"
  | "Yayin bekleniyor"
  | "Baglaniyor"
  | "Yayin aktif"
  | "Yayin bitti";

export function RoomClient({
  roomCode,
  initialRole,
}: {
  roomCode: string;
  initialRole: RoomRole;
}) {
  const peerId = useMemo(() => createPeerId(initialRole), [initialRole]);
  const roleRef = useRef(initialRole);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [participants, setParticipants] = useState<PresencePayload[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("Hazirlaniyor");
  const [isSharing, setIsSharing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Kopyala");
  const supabaseEnvReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() =>
    supabaseEnvReady
      ? null
      : "Supabase env is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
  const iceResolution = useMemo(
    () => resolveIceServers(process.env.NEXT_PUBLIC_RTC_ICE_SERVERS),
    [],
  );

  const viewerCount = participants.filter(
    (participant) => participant.role === "viewer",
  ).length;
  const hostOnline = participants.some(
    (participant) => participant.role === "host",
  );

  const sendSignal = useCallback(
    async (event: string, payload: SignalPayload) => {
      await channelRef.current?.send({
        type: "broadcast",
        event,
        payload,
      });
    },
    [],
  );

  const closePeerConnection = useCallback((remotePeerId: string) => {
    peerConnectionsRef.current.get(remotePeerId)?.close();
    peerConnectionsRef.current.delete(remotePeerId);
  }, []);

  const closeAllPeerConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((connection) => connection.close());
    peerConnectionsRef.current.clear();
  }, []);

  const createPeerConnection = useCallback(
    (remotePeerId: string) => {
      closePeerConnection(remotePeerId);

      const connection = new RTCPeerConnection({
        iceServers: iceResolution.iceServers,
      });

      connection.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }

        void sendSignal("ice-candidate", {
          from: peerId,
          to: remotePeerId,
          candidate: event.candidate.toJSON(),
        });
      };

      connection.ontrack = (event) => {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }

        remoteStreamRef.current.addTrack(event.track);

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
        }

        setStatus("Yayin aktif");
      };

      connection.onconnectionstatechange = () => {
        if (
          connection.connectionState === "failed" ||
          connection.connectionState === "disconnected"
        ) {
          setWarning("Baglanti koptu. Odaya yeniden katilman gerekebilir.");
        }
      };

      peerConnectionsRef.current.set(remotePeerId, connection);
      return connection;
    },
    [closePeerConnection, iceResolution.iceServers, peerId, sendSignal],
  );

  const createOfferForViewer = useCallback(
    async (viewerId: string) => {
      if (!localStreamRef.current) {
        return;
      }

      const connection = createPeerConnection(viewerId);
      localStreamRef.current.getTracks().forEach((track) => {
        connection.addTrack(track, localStreamRef.current as MediaStream);
      });

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await sendSignal("offer", {
        from: peerId,
        to: viewerId,
        sdp: offer,
      });
    },
    [createPeerConnection, peerId, sendSignal],
  );

  const stopSharing = useCallback(async () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setIsSharing(false);
    closeAllPeerConnections();
    await sendSignal("session-ended", { from: peerId, to: "room" });
    setStatus("Yayin bitti");
  }, [closeAllPeerConnections, peerId, sendSignal]);

  const startSharing = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Bu tarayici ekran paylasimini desteklemiyor.");
      return;
    }

    setError(null);
    setWarning(iceResolution.error ?? null);
    setStatus("Baglaniyor");

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(
        getDisplayMediaOptions(),
      );

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        void stopSharing();
      });

      if (stream.getAudioTracks().length === 0) {
        setWarning(
          "Tarayici bu secim icin ses track'i vermedi. Chrome/Edge'de sekme paylasirken 'Sekme sesini paylas' kutusunu isaretle; pencere veya tum ekran ses destegi tarayici ve isletim sistemine gore degisir.",
        );
      }

      setIsSharing(true);
      setStatus("Yayin aktif");

      await Promise.all(
        participants
          .filter((participant) => participant.role === "viewer")
          .map((participant) => createOfferForViewer(participant.peerId)),
      );
    } catch (shareError) {
      setStatus("Odaya baglandi");
      setError(
        shareError instanceof Error
          ? shareError.message
          : "Ekran paylasimi baslatilamadi.",
      );
    }
  }, [
    createOfferForViewer,
    iceResolution.error,
    participants,
    stopSharing,
  ]);

  useEffect(() => {
    if (!supabaseEnvReady) {
      return;
    }

    roleRef.current = initialRole;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(`room:${roomCode}`, {
      config: {
        broadcast: { self: false },
        presence: { key: peerId },
      },
    });

    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresencePayload>();
        const nextParticipants = Object.values(state)
          .flat()
          .filter((presence) => presence.peerId && presence.role);
        setParticipants(nextParticipants);
      })
      .on("broadcast", { event: "viewer-ready" }, ({ payload }) => {
        const signal = payload as SignalPayload;
        if (
          roleRef.current === "host" &&
          localStreamRef.current &&
          signal.viewerId
        ) {
          void createOfferForViewer(signal.viewerId);
        }
      })
      .on("broadcast", { event: "offer" }, ({ payload }) => {
        const signal = payload as SignalPayload;
        if (roleRef.current !== "viewer" || signal.to !== peerId || !signal.sdp) {
          return;
        }

        const sdp = signal.sdp;
        void (async () => {
          setStatus("Baglaniyor");
          const connection = createPeerConnection(signal.from);
          await connection.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          await sendSignal("answer", {
            from: peerId,
            to: signal.from,
            sdp: answer,
          });
        })();
      })
      .on("broadcast", { event: "answer" }, ({ payload }) => {
        const signal = payload as SignalPayload;
        if (roleRef.current !== "host" || signal.to !== peerId || !signal.sdp) {
          return;
        }

        void peerConnectionsRef.current
          .get(signal.from)
          ?.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      })
      .on("broadcast", { event: "ice-candidate" }, ({ payload }) => {
        const signal = payload as SignalPayload;
        if (signal.to !== peerId || !signal.candidate) {
          return;
        }

        void peerConnectionsRef.current
          .get(signal.from)
          ?.addIceCandidate(new RTCIceCandidate(signal.candidate));
      })
      .on("broadcast", { event: "session-ended" }, ({ payload }) => {
        const signal = payload as SignalPayload;
        if (roleRef.current !== "viewer" || signal.from === peerId) {
          return;
        }

        closeAllPeerConnections();
        remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
        remoteStreamRef.current = null;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
        setStatus("Yayin bitti");
      })
      .subscribe(async (subscribeStatus) => {
        if (subscribeStatus !== "SUBSCRIBED") {
          return;
        }

        setStatus(initialRole === "viewer" ? "Yayin bekleniyor" : "Odaya baglandi");
        await channel.track({
          peerId,
          role: initialRole,
          joinedAt: new Date().toISOString(),
        });

        if (initialRole === "viewer") {
          await channel.send({
            type: "broadcast",
            event: "viewer-ready",
            payload: { from: peerId, to: "host", viewerId: peerId },
          });
        }
      });

    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
      closeAllPeerConnections();
      if (channelRef.current) {
        void channelRef.current.unsubscribe();
      }
    };
  }, [
    closeAllPeerConnections,
    createOfferForViewer,
    createPeerConnection,
    initialRole,
    peerId,
    roomCode,
    sendSignal,
    supabaseEnvReady,
  ]);

  async function copyRoomCode() {
    await navigator.clipboard.writeText(roomCode);
    setCopyLabel("Kopyalandi");
    window.setTimeout(() => setCopyLabel("Kopyala"), 1500);
  }

  function toggleViewerMute() {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = nextMuted;
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={initialRole === "host" ? "default" : "secondary"}>
                {initialRole === "host" ? "Yayin sahibi" : "Izleyici"}
              </Badge>
              <Badge variant="outline" className="font-mono text-sm">
                Oda {roomCode}
              </Badge>
              <Badge variant="secondary">{status}</Badge>
            </div>
            <h1 className="text-xl font-semibold tracking-normal">
              {initialRole === "host"
                ? "Ekran paylasimini yonet"
                : "Canli ekrani izle"}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={copyRoomCode}>
                  <Clipboard className="size-4" />
                  {copyLabel}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Oda numarasini panoya kopyala</TooltipContent>
            </Tooltip>
            <Button variant="ghost" asChild>
              <Link href="/">Cikis</Link>
            </Button>
          </div>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Islem tamamlanamadi</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {warning ? (
          <Alert>
            <AlertTitle>Uyari</AlertTitle>
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid flex-1 gap-5 lg:grid-cols-[1fr_320px]">
          <Card className="min-h-[420px] overflow-hidden">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>
                  {initialRole === "host" ? "Yerel yayin" : "Yayin ekrani"}
                </CardTitle>
                <CardDescription>
                  {initialRole === "host"
                    ? "Paylastigin ekran burada onizlenir."
                    : hostOnline
                      ? "Host paylasimi baslattiginda goruntu burada acilir."
                      : "Host odaya baglaninca yayin beklenir."}
                </CardDescription>
              </div>
              {initialRole === "viewer" ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleViewerMute}
                  aria-label={isMuted ? "Sesi ac" : "Sesi kapat"}
                >
                  {isMuted ? (
                    <VolumeX className="size-4" />
                  ) : (
                    <Volume2 className="size-4" />
                  )}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
                {initialRole === "host" ? (
                  <video
                    ref={localVideoRef}
                    className="h-full w-full object-contain"
                    autoPlay
                    muted
                    playsInline
                  />
                ) : (
                  <video
                    ref={remoteVideoRef}
                    className="h-full w-full object-contain"
                    autoPlay
                    playsInline
                  />
                )}
                {!isSharing && initialRole === "host" ? (
                  <div className="absolute inset-0 grid place-items-center p-6 text-center">
                    <div className="max-w-sm space-y-3">
                      <MonitorUp className="mx-auto size-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Ekran paylasimini baslatinca onizleme burada gorunur.
                      </p>
                    </div>
                  </div>
                ) : null}
                {initialRole === "viewer" && status !== "Yayin aktif" ? (
                  <div className="absolute inset-0 grid place-items-center p-6 text-center">
                    <div className="w-full max-w-sm space-y-4">
                      <Skeleton className="mx-auto h-24 w-40" />
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        {hostOnline ? "Yayin bekleniyor" : "Host bekleniyor"}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <aside className="space-y-5">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Radio className="size-4 text-muted-foreground" />
                  <CardTitle>Kontroller</CardTitle>
                </div>
                <CardDescription>Oda ve yayin durumu</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {initialRole === "host" ? (
                  isSharing ? (
                    <Button
                      className="w-full"
                      variant="destructive"
                      onClick={() => void stopSharing()}
                    >
                      <MonitorStop className="size-4" />
                      Paylasimi durdur
                    </Button>
                  ) : (
                    <Button className="w-full" onClick={() => void startSharing()}>
                      <MonitorUp className="size-4" />
                      Ekran ve ses paylas
                    </Button>
                  )
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {isMuted ? (
                      <MicOff className="size-4" />
                    ) : (
                      <Mic className="size-4" />
                    )}
                    Izleyici modu
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground">Izleyici</div>
                    <div className="mt-1 text-2xl font-semibold">{viewerCount}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground">Host</div>
                    <div className="mt-1 text-2xl font-semibold">
                      {hostOnline ? "1" : "0"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  <CardTitle>Katilimcilar</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {participants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Henuz katilimci yok.
                  </p>
                ) : (
                  participants.map((participant) => (
                    <div
                      key={participant.peerId}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-xs">
                        {participant.peerId}
                      </span>
                      <Badge variant="secondary">{participant.role}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </main>
  );
}
