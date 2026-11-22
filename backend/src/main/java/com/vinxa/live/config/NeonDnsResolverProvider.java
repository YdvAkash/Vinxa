package com.vinxa.live.config;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.net.spi.InetAddressResolver;
import java.net.spi.InetAddressResolverProvider;
import java.util.stream.Stream;

public class NeonDnsResolverProvider extends InetAddressResolverProvider {

    @Override
    public InetAddressResolver get(Configuration configuration) {
        InetAddressResolver builtin = configuration.builtinResolver();
        return new InetAddressResolver() {
            @Override
            public Stream<InetAddress> lookupByName(String host, LookupPolicy lookupPolicy) throws UnknownHostException {
                if (host != null && host.contains("neon.tech")) {
                    try {
                        // 3.147.219.177 resolved via 8.8.8.8 for c-9.us-east-2.aws.neon.tech
                        byte[] ipBytes = new byte[]{(byte) 3, (byte) 147, (byte) 219, (byte) 177};
                        InetAddress addr = InetAddress.getByAddress(host, ipBytes);
                        return Stream.of(addr);
                    } catch (Exception ignored) {
                        return builtin.lookupByName(host, lookupPolicy);
                    }
                }
                return builtin.lookupByName(host, lookupPolicy);
            }

            @Override
            public String lookupByAddress(byte[] addr) throws UnknownHostException {
                return builtin.lookupByAddress(addr);
            }
        };
    }

    @Override
    public String name() {
        return "NeonDnsResolverProvider";
    }
}
