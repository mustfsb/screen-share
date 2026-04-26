"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { MonitorUp, Radio, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { generateRoomCode, normalizeRoomCode } from "@/lib/room";

export function HomeScreen() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function createRoom() {
    router.push(`/room/${generateRoomCode()}?role=host`);
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = normalizeRoomCode(roomCode);
    if (!normalized) {
      setError("Oda numarasi 6 haneli olmalidir.");
      return;
    }

    router.push(`/room/${normalized}?role=viewer`);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-8 px-5 py-8 sm:px-8">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border bg-card">
              <MonitorUp className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">
                Ekran Paylasimi
              </h1>
              <p className="text-sm text-muted-foreground">
                Oda kodu ile ekran ve ses yayinini izlet.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">WebRTC P2P</Badge>
            <Badge variant="secondary">Supabase Realtime</Badge>
            <Badge variant="outline">1-5 izleyici</Badge>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-muted-foreground" />
                <CardTitle>Oda olustur</CardTitle>
              </div>
              <CardDescription>
                Ekranini paylasmak icin yeni bir oda numarasi uret.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" size="lg" onClick={createRoom}>
                <MonitorUp className="size-4" />
                Oda olustur
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                <CardTitle>Odaya katil</CardTitle>
              </div>
              <CardDescription>
                Izlemek icin yayin sahibinden aldigin 6 haneli kodu gir.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={joinRoom}>
                <div className="space-y-2">
                  <Label htmlFor="room-code">Oda numarasi</Label>
                  <Input
                    id="room-code"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="123456"
                    value={roomCode}
                    onChange={(event) => {
                      setError(null);
                      setRoomCode(event.target.value);
                    }}
                  />
                  {error ? (
                    <p className="text-sm text-destructive">{error}</p>
                  ) : null}
                </div>
                <Button className="w-full" size="lg" type="submit">
                  Odaya katil
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>

        <Separator />

        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Paylasim tarayicinin ekran yakalama iznine baglidir. Ses aktarimi,
          tarayici ve isletim sistemi destekliyorsa ekran yakalama seciminde
          etkinlesir.
        </p>
      </div>
    </main>
  );
}
