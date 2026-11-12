#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <ImageIO/ImageIO.h>

static NSArray *points(VNFaceLandmarkRegion2D *region, CGRect box, CGSize size) {
    NSMutableArray *result = [NSMutableArray arrayWithCapacity:region.pointCount];
    for (NSUInteger i = 0; i < region.pointCount; i++) {
        CGPoint p = region.normalizedPoints[i];
        [result addObject:@[@((box.origin.x + p.x * box.size.width) * size.width),
                            @((1 - box.origin.y - p.y * box.size.height) * size.height)]];
    }
    return result;
}

int main(int argc, char **argv) {
    @autoreleasepool {
        for (int i = 1; i < argc; i++) {
            @autoreleasepool {
                NSString *path = [NSString stringWithUTF8String:argv[i]];
                NSURL *url = [NSURL fileURLWithPath:path];
                CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
                CGImageRef image = source ? CGImageSourceCreateImageAtIndex(source, 0, NULL) : NULL;
                if (source) CFRelease(source);
                if (!image) {
                    fprintf(stderr, "Could not read %s\n", path.lastPathComponent.UTF8String);
                    return 1;
                }
                CGSize size = CGSizeMake(CGImageGetWidth(image), CGImageGetHeight(image));
                VNDetectFaceLandmarksRequest *request = [[VNDetectFaceLandmarksRequest alloc] init];
                request.usesCPUOnly = YES;
                VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
                CGImageRelease(image);
                NSError *error = nil;
                if (![handler performRequests:@[request] error:&error]) {
                    fprintf(stderr, "Vision failed on %s: %s\n", path.lastPathComponent.UTF8String,
                        error.localizedDescription.UTF8String);
                    return 1;
                }

                NSMutableArray *faces = [NSMutableArray array];
                for (VNFaceObservation *face in request.results) {
                    VNFaceLandmarks2D *m = face.landmarks;
                    if (!m) continue;
                    CGRect box = face.boundingBox;
                    [faces addObject:@{
                        @"center": @[@(CGRectGetMidX(box) * size.width), @((1 - CGRectGetMidY(box)) * size.height)],
                        @"contour": points(m.faceContour, box, size),
                        @"left_eye": points(m.leftEye, box, size),
                        @"right_eye": points(m.rightEye, box, size),
                        @"left_brow": points(m.leftEyebrow, box, size),
                        @"right_brow": points(m.rightEyebrow, box, size),
                        @"nose": points(m.nose, box, size),
                        @"outer_lips": points(m.outerLips, box, size),
                        @"yaw": face.yaw ?: @0
                    }];
                }
                NSData *data = [NSJSONSerialization dataWithJSONObject:faces options:0 error:&error];
                if (!data) return 1;
                fwrite(data.bytes, 1, data.length, stdout);
                fputc('\n', stdout);
            }
        }
    }
    return 0;
}
