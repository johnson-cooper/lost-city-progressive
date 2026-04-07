import FileStream from '#/io/FileStream.js';
import Packet from '#/io/Packet.js';
import ClientSocket from '#/server/ClientSocket.js';

type OnDemandRequest = {
    client: ClientSocket;
    archive: number;
    file: number;
}

class OnDemand {
    cache = new FileStream('data/pack');

    urgentRequests: OnDemandRequest[] = []; // needed ASAP
    extraRequests: OnDemandRequest[] = []; // not logged in preloading extras
    ingameRequests: OnDemandRequest[] = []; // logged in preloading extras

    cycle() {
        // todo: limit requests per client per cycle

        for (let i = 0; i < this.urgentRequests.length; i++) {
            const req = this.urgentRequests[i];
            this.send(req.client, req.archive, req.file);
            this.urgentRequests.splice(i--, 1);
        }

        for (let i = 0; i < this.extraRequests.length; i++) {
            const req = this.extraRequests[i];
            this.send(req.client, req.archive, req.file);
            this.extraRequests.splice(i--, 1);
        }

        for (let i = 0; i < this.ingameRequests.length; i++) {
            const req = this.ingameRequests[i];
            this.send(req.client, req.archive, req.file);
            this.ingameRequests.splice(i--, 1);
        }

        setTimeout(this.cycle.bind(this), 50);
    }

    onClientData(client: ClientSocket) {
        if (client.state !== 2) {
            return;
        }

        if (client.available < 4) {
            return;
        }

        const buf = Packet.alloc(0);
        while (client.available >= 4) {
            client.read(buf.data, 0, 4);
            buf.pos = 0;

            const archive = buf.g1();
            const file = buf.g2();
            const priority = buf.g1();

            if (archive > 3 || priority > 2) {
                client.close();
                return;
            }

            if (priority === 2) {
                this.urgentRequests.push({
                    client,
                    archive,
                    file
                });
            } else if (priority === 1) {
                this.extraRequests.push({
                    client,
                    archive,
                    file
                });
            } else {
                this.ingameRequests.push({
                    client,
                    archive,
                    file
                });
            }
        }
    }

    private send(client: ClientSocket, archive: number, file: number) {
        const req = this.cache.read(archive + 1, file);

        if (req) {
            let pos = 0;
            let part = 0;

            while (pos < req.length) {
                let remaining = req.length - pos;
                if (remaining > 500) {
                    remaining = 500;
                }

                const temp = new Packet(new Uint8Array(6 + remaining));
                temp.p1(archive);
                temp.p2(file);
                temp.p2(req.length);
                temp.p1(part);
                temp.pdata(req, pos, remaining);

                pos += remaining;
                part++;
                client.send(temp.data);
            }
        } else {
            // rejected if size=0
            const temp = new Packet(new Uint8Array(6));
            temp.p1(archive);
            temp.p2(file);
            temp.p2(0);
            temp.p1(0);
            client.send(temp.data);
        }
    }
}

export default new OnDemand();
